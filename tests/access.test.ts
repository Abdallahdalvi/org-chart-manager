import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from 'jose';
import {
  createAccessAuthenticator,
  readAccessConfig,
} from '../selfhost/access-auth';
import { authorizedChange } from '../selfhost/authorized-change';
import { createApp } from '../selfhost/app';
import type { Store } from '../selfhost/store';
import { emailSession } from '../lib/access';
import { emptyDocument } from '../lib/empty-document';
import type { OrgDocument } from '../lib/model';
import { approvalStatus } from '../lib/organization';
import { AccessReview } from '../components/access-review';

let passed = 0;
const pass = (message: string) => {
  passed++;
  console.log('PASS ' + message);
};
const cfg = readAccessConfig({
  CF_ACCESS_TEAM_DOMAIN: 'org-chart-tests.cloudflareaccess.com',
  CF_ACCESS_AUD: 'a'.repeat(64),
  APP_EDITOR_EMAILS: 'editor@example.com',
  APP_HR_EMAILS: 'hr@example.com',
  APP_APPROVER_EMAILS: 'executive@example.com',
  APP_VIEWER_EMAILS: 'viewer@example.com',
});
for (const team of [
  'https://org-chart-tests.cloudflareaccess.com',
  'evil.example.com',
  'x.cloudflareaccess.com.evil.example',
  'localhost',
  'x.cloudflareaccess.com/path',
])
  assert.throws(() => readAccessConfig({ CF_ACCESS_TEAM_DOMAIN: team }));
assert.throws(() =>
  readAccessConfig({
    CF_ACCESS_TEAM_DOMAIN: cfg.teamDomain,
    CF_ACCESS_AUD: cfg.audience,
    APP_EDITOR_EMAILS: '*@example.com',
  }),
);
assert.throws(() =>
  readAccessConfig({
    CF_ACCESS_TEAM_DOMAIN: cfg.teamDomain,
    CF_ACCESS_AUD: cfg.audience,
  }),
);
pass(
  'Access configuration accepts exact trusted team domains and exact email lists only',
);

const keys = await generateKeyPair('RS256');
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: 'test-key',
  alg: 'RS256',
};
const verify = createAccessAuthenticator(
  cfg,
  createLocalJWKSet({ keys: [jwk] }),
);
const issuer = `https://${cfg.teamDomain}`;
async function token(
  email = 'editor@example.com',
  overrides: Record<string, unknown> = {},
  key = keys.privateKey,
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer,
    aud: [cfg.audience],
    sub: 'user-' + email,
    email,
    iat: now,
    exp: now + 600,
    type: 'app',
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .sign(key);
}
const editorToken = await token(),
  hrToken = await token('hr@example.com'),
  approverToken = await token('executive@example.com'),
  viewerToken = await token('viewer@example.com');
const editor = await verify(editorToken),
  hr = await verify(hrToken),
  approver = await verify(approverToken),
  viewer = await verify(viewerToken);
assert(
  editor.canEdit &&
    !editor.canApprove &&
    !editor.canValidate &&
    !editor.canManageApprovers,
);
assert(hr.canEdit && hr.canValidate && hr.canApprove && hr.canManageApprovers);
assert(
  approver.canApprove &&
    !approver.canValidate &&
    !approver.canManageApprovers &&
    !approver.canEdit,
);
assert(!viewer.canEdit && !viewer.canApprove);
assert.equal(
  (await verify(await token('EDITOR@EXAMPLE.COM'))).email,
  'editor@example.com',
);
assert.deepEqual(
  (
    await verify(
      await token('editor@example.com', { role: 'admin', roles: ['hr'] }),
    )
  ).roles,
  ['editor'],
);
pass(
  'Verified emails receive only configured roles; token-supplied roles cannot elevate permissions',
);
for (const claims of [
  { aud: 'b'.repeat(64) },
  { iss: 'https://attacker.cloudflareaccess.com' },
  { exp: 1 },
  { exp: undefined },
  { iat: undefined },
  { iat: Math.floor(Date.now() / 1000) + 100 },
  { sub: undefined },
  { sub: '' },
  { email: undefined },
  { type: 'service' },
  { nbf: Math.floor(Date.now() / 1000) + 100 },
])
  await assert.rejects(verify(await token('editor@example.com', claims)));
await assert.rejects(verify(undefined));
await assert.rejects(verify('not.a.jwt'));
await assert.rejects(verify('x'.repeat(16001)));
await assert.rejects(verify(await token('unlisted@example.com')), /no role/);
const rogue = await generateKeyPair('RS256');
await assert.rejects(
  verify(await token('editor@example.com', {}, rogue.privateKey)),
);
const hmac = await new SignJWT({
  email: 'editor@example.com',
  iss: issuer,
  aud: cfg.audience,
})
  .setProtectedHeader({ alg: 'HS256' })
  .sign(new Uint8Array(32));
await assert.rejects(verify(hmac));
const unavailable = createAccessAuthenticator(cfg, async () => {
  throw new Error('Key server unavailable');
});
await assert.rejects(unavailable(editorToken));
pass(
  'Signature, issuer, audience, required claims, expiry, algorithm and key failures all fail closed',
);

const doc: OrgDocument = {
  ...structuredClone(emptyDocument),
  company: 'Access test chart',
  version: '1.0',
  approvers: [
    { person: 'HR Reviewer', role: 'HR department', email: 'hr@example.com' },
    {
      person: 'Executive Reviewer',
      role: 'Executive',
      email: 'executive@example.com',
    },
  ],
};
const saved = authorizedChange(
  doc,
  {
    action: 'save',
    actor: 'hr@example.com',
    document: { ...doc, company: 'Edited chart', approvedBy: 'Forged' },
    description: 'A real chart edit',
  },
  editor,
);
assert.equal(saved.updatedBy, 'editor@example.com');
assert.equal(saved.history[0].by, 'editor@example.com');
assert.equal(saved.approvedBy, '');
for (const action of [
  'validate',
  'approve',
  'review-settings',
  'external-approval',
  'evidence',
])
  assert.throws(
    () => authorizedChange(doc, { action, confirm: true }, editor),
    /permission|not available/,
  );
assert.throws(
  () =>
    authorizedChange(
      doc,
      { action: 'save', document: { ...doc, approvers: [] } },
      editor,
    ),
  /Only HR/,
);
for (const action of ['save', 'restore']) {
  assert.throws(
    () => authorizedChange(doc, { action, document: doc }, approver),
    /permission/,
  );
}
const hrSaved = authorizedChange(
  doc,
  {
    action: 'save',
    actor: 'hr@example.com',
    document: { ...doc, company: 'HR-maintained chart' },
    description: 'HR updated the master chart',
  },
  hr,
);
assert.equal(hrSaved.updatedBy, 'hr@example.com');
assert.equal(hrSaved.company, 'HR-maintained chart');
for (const action of [
  'save',
  'restore',
  'validate',
  'approve',
  'review-settings',
  'external-approval',
  'evidence',
])
  assert.throws(
    () => authorizedChange(doc, { action, document: doc }, viewer),
    /permission|not available/,
  );
pass('Server authorizes each mutation and binds audit names to verified email');

assert.throws(
  () => authorizedChange(doc, { action: 'validate' }, hr),
  /Confirm/,
);
const validated = authorizedChange(
  doc,
  {
    action: 'validate',
    confirm: true,
    revision: 2,
    person: 'Forged person',
    actor: 'Forged actor',
    date: '2000-01-01',
  },
  hr,
);
assert.equal(validated.validatedBy, 'hr@example.com');
assert.equal(validated.evidence[0].recordedBy, 'hr@example.com');
assert.equal(validated.evidence[0].date, new Date().toISOString().slice(0, 10));
assert(
  validated.evidence[0].reference.includes('Cloudflare Access confirmation'),
);
assert.throws(
  () => authorizedChange(validated, { action: 'validate', confirm: true }, hr),
  /already recorded/,
);
assert.throws(
  () =>
    authorizedChange(
      doc,
      { action: 'approve', confirm: true, approverIndex: 1 },
      approver,
    ),
  /HR validation first/,
);
assert.throws(
  () =>
    authorizedChange(
      validated,
      { action: 'approve', confirm: true, approverIndex: 0 },
      approver,
    ),
  /assigned to your verified email/,
);
const firstApproval = authorizedChange(
  validated,
  { action: 'approve', confirm: true, approverIndex: 0 },
  hr,
);
assert.equal(approvalStatus(firstApproval).approved, false);
const approved = authorizedChange(
  firstApproval,
  { action: 'approve', confirm: true, approverIndex: 1 },
  approver,
);
assert.equal(approvalStatus(approved).approved, true);
assert.equal(approved.evidence.at(-1)?.person, 'Executive Reviewer');
assert.equal(approved.evidence.at(-1)?.recordedBy, 'executive@example.com');
assert.throws(
  () =>
    authorizedChange(
      approved,
      { action: 'approve', confirm: true, approverIndex: 1 },
      approver,
    ),
  /already recorded/,
);
pass(
  'Validation and self-approval use server identity/time, require correct sequence and prohibit impersonation',
);

const newDraft = authorizedChange(
  approved,
  { action: 'save', document: approved, description: 'Updated chart' },
  editor,
);
assert.equal(newDraft.version, '1.1');
assert.equal(approvalStatus(newDraft).approved, false);
assert.equal(newDraft.validatedBy, '');
assert.equal(newDraft.approvedBy, '');
assert.equal(newDraft.evidence.length, 3);
const restored = authorizedChange(
  approved,
  {
    action: 'restore',
    document: {
      ...approved,
      approvers: [
        { person: 'Fake', role: 'Admin', email: 'editor@example.com' },
      ],
    },
    description: 'Restored chart',
  },
  editor,
);
assert.deepEqual(restored.approvers, approved.approvers);
assert.equal(approvalStatus(restored).approved, false);
assert(
  restored.evidence.slice(3).every((e) => e.version.startsWith('backup ')),
);
const settings = authorizedChange(
  approved,
  {
    action: 'review-settings',
    settings: {
      company: doc.company,
      reviewDate: '2026-10-01',
      approvers: doc.approvers,
    },
  },
  hr,
);
assert.equal(approvalStatus(settings).approved, false);
assert.equal(settings.updatedBy, 'hr@example.com');
pass(
  'Editing, restore and review settings produce fresh drafts without losing audit history or bypassing HR reviewer requirements',
);

const external = authorizedChange(
  validated,
  {
    action: 'external-approval',
    evidence: {
      person: 'Executive Reviewer',
      role: 'Executive',
      date: new Date().toISOString().slice(0, 10),
      reference: 'Archived original approval email',
      note: '',
    },
  },
  hr,
);
assert(
  external.evidence
    .at(-1)
    ?.reference.startsWith('External evidence (recorded by HR):'),
);
assert.equal(external.evidence.at(-1)?.recordedBy, 'hr@example.com');
assert.throws(
  () => authorizedChange(validated, { action: 'external-approval' }, approver),
  /permission/,
);
pass('External approvals are explicitly labeled and only HR may record them');

let state = { revision: 0, document: structuredClone(doc) };
const store: Store = {
  async load() {
    return structuredClone(state);
  },
  async save(expected, document) {
    if (expected !== state.revision) return false;
    state = { revision: expected + 1, document };
    return true;
  },
  async revisions() {
    return [];
  },
  async snapshot() {
    return structuredClone(state.document);
  },
};
const origin = 'https://orgchart.example.com';
const server = createApp(
  {
    origin,
    clientDir: resolve('selfhost-dist/client'),
    access: verify,
    username: 'legacy',
    password: 'legacy-password-must-not-work',
  },
  store,
);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}`;
const request = (path: string, jwt?: string) =>
  fetch(base + path, {
    headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {},
  });
const put = (jwt: string, body: unknown, requestOrigin = origin) =>
  fetch(base + '/api/document', {
    method: 'PUT',
    headers: {
      'Cf-Access-Jwt-Assertion': jwt,
      Origin: requestOrigin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
try {
  for (const path of [
    '/',
    '/api/session',
    '/api/document',
    '/api/revisions',
    '/ubiqedge-logo.jpg',
  ]) {
    const noLogin = await request(path);
    assert.equal(noLogin.status, 401);
    assert.equal(noLogin.headers.get('www-authenticate'), null);
    assert.equal((await request(path, viewerToken)).status, 200);
  }
  assert.equal((await request('/healthz')).status, 200);
  assert.equal(
    (
      await fetch(base + '/api/document', {
        headers: {
          'Cf-Access-Authenticated-User-Email': 'hr@example.com',
          Authorization:
            'Basic ' +
            Buffer.from('legacy:legacy-password-must-not-work').toString(
              'base64',
            ),
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request('/api/document', await token('unlisted@example.com')))
      .status,
    403,
  );
  assert.deepEqual(
    await (await request('/api/session', editorToken)).json(),
    editor,
  );
  pass(
    'All HTTP pages, assets and APIs require a valid Access token; old passwords and spoofed email headers cannot bypass it',
  );
  assert.equal(
    (await put(editorToken, { revision: 0, action: 'validate', confirm: true }))
      .status,
    403,
  );
  assert.equal(
    (await put(viewerToken, { revision: 0, action: 'save', document: doc }))
      .status,
    403,
  );
  assert.equal(
    (
      await put(
        hrToken,
        { revision: 0, action: 'validate', confirm: true },
        'https://evil.example',
      )
    ).status,
    403,
  );
  assert.equal(state.revision, 0);
  assert.equal(
    (
      await put(hrToken, {
        revision: 0,
        action: 'validate',
        confirm: true,
        actor: 'Fake',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await put(hrToken, {
        revision: 0,
        action: 'approve',
        confirm: true,
        approverIndex: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await put(hrToken, {
        revision: 1,
        action: 'approve',
        confirm: true,
        approverIndex: 1,
      })
    ).status,
    403,
  );
  assert.equal(state.revision, 1);
  assert.equal(state.document.validatedBy, 'hr@example.com');
  pass(
    'HTTP permission checks, same-origin protection, stale-version rejection and identity-bound saving work together',
  );
} finally {
  await new Promise<void>((done) => server.close(() => done()));
}

const props = {
  doc: validated,
  busy: false,
  error: '',
  onAction: async () => false,
};
const editorUI = renderToStaticMarkup(
  createElement(AccessReview, { ...props, session: editor }),
);
const hrUI = renderToStaticMarkup(
  createElement(AccessReview, { ...props, doc, session: hr }),
);
const approverUI = renderToStaticMarkup(
  createElement(AccessReview, { ...props, session: approver }),
);
assert(!editorUI.includes('Confirm your review'));
assert(!editorUI.includes('HR settings'));
assert(
  hrUI.includes('Validate this version as HR') && hrUI.includes('HR settings'),
);
assert(approverUI.replace(/<!--.*?-->/g, '').includes('Approve · Executive'));
assert(
  !approverUI.includes('Record stakeholder approval received outside the app'),
);
assert.deepEqual(
  emailSession('both@example.com', ['editor', 'hr']).canEdit,
  true,
);
pass(
  'Role-specific review UI exposes the matching actions without granting new permissions',
);
console.log(
  `\n${passed} Cloudflare Access checks passed. No live account or database was changed.`,
);
