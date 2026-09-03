import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createApp } from '../selfhost/app';
import {
  supabaseStore,
  StorageError,
  type Store,
  type Snapshot,
} from '../selfhost/store';
import { initialDocument } from '../lib/seed';
import { prepareChange } from '../lib/changes';
import type { OrgDocument } from '../lib/model';

let passed = 0;
const pass = (label: string) => {
  passed++;
  console.log('PASS ' + label);
};
const pg = new PGlite();
await pg.exec(
  'create role anon; create role authenticated; create role service_role bypassrls;',
);
await pg.exec(await readFile('supabase/001_org_chart.sql', 'utf8'));
pass('Supabase schema and function execute in PostgreSQL');
for (const role of ['anon', 'authenticated']) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(
    pg.query('select * from public.org_chart_documents'),
    /permission denied/,
  );
  await assert.rejects(
    pg.query('select public.org_chart_save(0, $1, $1)', [initialDocument]),
    /permission denied/,
  );
  await pg.exec('reset role');
}
pass(
  'Anonymous and regular Supabase users cannot read records or execute the save function',
);
const rls = await pg.query<{ relrowsecurity: boolean }>(
  "select relrowsecurity from pg_class where relname in ('org_chart_documents','org_chart_snapshots')",
);
assert.equal(rls.rows.length, 2);
assert(rls.rows.every((r) => r.relrowsecurity));
await pg.exec('set role service_role');
const store: Store = {
  async load() {
    const result = await pg.query<{ revision: number; data: OrgDocument }>(
      "select revision, data from public.org_chart_documents where id = 'company'",
    );
    return result.rows[0]
      ? {
          revision: Number(result.rows[0].revision),
          document: result.rows[0].data,
        }
      : { revision: 0, document: structuredClone(initialDocument) };
  },
  async save(expected, doc, previous) {
    return (
      await pg.query<{ saved: boolean }>(
        'select public.org_chart_save($1,$2,$3) as saved',
        [expected, doc, previous],
      )
    ).rows[0].saved;
  },
  async revisions() {
    return (
      await pg.query<Snapshot>(
        'select revision,version,date::text from public.org_chart_snapshots order by revision desc',
      )
    ).rows;
  },
  async snapshot(revision) {
    return (
      (
        await pg.query<{ data: OrgDocument }>(
          'select data from public.org_chart_snapshots where revision=$1',
          [revision],
        )
      ).rows[0]?.data || null
    );
  },
};
const next = prepareChange(initialDocument, {
  action: 'save',
  actor: 'Test editor',
  description: 'Test update',
  document: { ...initialDocument, company: 'Test company' },
});
assert(await store.save(0, next, initialDocument));
assert.equal(await store.save(0, initialDocument, initialDocument), false);
assert.equal((await store.load()).revision, 1);
assert.equal((await store.snapshot(0))!.company, initialDocument.company);
assert.equal((await store.snapshot(1))!.company, 'Test company');
pass(
  'Service-role save is atomic, rejects stale revisions and preserves before/after snapshots',
);
const beforeFailure = await store.load();
await assert.rejects(
  pg.query('select public.org_chart_save($1,$2,$3)', [
    1,
    { ...next, version: null },
    next,
  ]),
);
assert.deepEqual(await store.load(), beforeFailure);
pass('Snapshot failure rolls back the document update');

const config = {
  origin: 'http://localhost:3080',
  username: 'test',
  password: 'not-a-real-password-test-only',
  clientDir: resolve('selfhost-dist/client'),
};
const server = createApp(config, store);
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}`;
const auth = {
  Authorization:
    'Basic ' +
    Buffer.from(config.username + ':' + config.password).toString('base64'),
};
const put = (body: unknown, origin = config.origin) =>
  fetch(base + '/api/document', {
    method: 'PUT',
    headers: { ...auth, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
try {
  for (const path of [
    '/',
    '/api/document',
    '/api/revisions',
    '/ubiqedge-logo.jpg',
  ])
    assert.equal((await fetch(base + path)).status, 401);
  assert.equal((await fetch(base + '/healthz')).status, 200);
  pass('Every page, asset, employee record and backup requires authentication');
  const page = await fetch(base + '/', { headers: auth });
  assert.equal(page.status, 200);
  assert((await page.text()).includes('http://localhost:3080/og.png'));
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(
    (await fetch(base + '/ubiqedge-logo.jpg', { headers: auth })).status,
    200,
  );
  assert.equal((await fetch(base + '/.env', { headers: auth })).status, 404);
  pass(
    'Authenticated self-hosted page and logo respond with security headers and correct metadata',
  );
  assert.equal((await put({}, 'https://evil.example')).status, 403);
  assert.equal(
    (
      await put({
        revision: 1,
        action: 'save',
        actor: '',
        document: next,
        description: 'Test',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await put({
        revision: 0,
        action: 'save',
        actor: 'Test',
        document: next,
        description: 'Test',
      })
    ).status,
    409,
  );
  assert.equal((await store.load()).revision, 1);
  pass('Cross-origin, invalid and stale API writes cannot mutate data');
  const payload = {
    revision: 1,
    action: 'save',
    actor: 'Test editor',
    document: next,
    description: 'API save',
  };
  const concurrent = await Promise.all([put(payload), put(payload)]);
  assert.deepEqual(
    concurrent.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  const state = await store.load();
  assert.equal(state.revision, 2);
  assert.equal(state.document.version, '0.4');
  assert.equal((await store.revisions()).length, 3);
  pass(
    'Two concurrent API edits produce one save, one conflict and no lost update',
  );
  const restore = await put({
    revision: 2,
    action: 'restore',
    actor: 'Test editor',
    document: initialDocument,
    description: 'Restore test',
  });
  assert.equal(restore.status, 200);
  assert.equal((await store.load()).document.company, 'Ubiqedge');
  assert.equal((await store.load()).document.version, '0.5');
  assert.equal(
    (await fetch(base + '/api/revisions?revision=0', { headers: auth })).status,
    200,
  );
  assert.equal(
    (await fetch(base + '/api/revisions?revision=no', { headers: auth }))
      .status,
    400,
  );
  pass(
    'Master restore creates a fresh version while earlier snapshots remain downloadable',
  );
  const restoredState = await store.load();
  const manualResponse = await put({
    revision: restoredState.revision,
    action: 'save',
    actor: 'Test editor',
    document: {
      ...restoredState.document,
      versionMode: 'manual',
      version: '2.0',
    },
    description: 'Set manual version',
  });
  assert.equal(manualResponse.status, 200);
  const manualState = await store.load();
  assert.equal(manualState.document.version, '2.0');
  assert.equal(manualState.document.versionMode, 'manual');
  const manualEdit = await put({
    revision: manualState.revision,
    action: 'save',
    actor: 'Test editor',
    document: { ...manualState.document, company: 'Manual version test' },
    description: 'Edit without increasing manual version',
  });
  assert.equal(manualEdit.status, 200);
  const manualEdited = await store.load();
  assert.equal(manualEdited.document.version, '2.0');
  assert.notEqual(
    manualEdited.document.contentId,
    manualState.document.contentId,
  );
  const sameVersionSnapshots = (await store.revisions()).filter(
    (s) => s.version === '2.0',
  );
  assert.equal(sameVersionSnapshots.length, 2);
  assert.notEqual(
    sameVersionSnapshots[0].revision,
    sameVersionSnapshots[1].revision,
  );
  assert.equal(
    (await store.snapshot(manualState.revision))!.company,
    'Ubiqedge',
  );
  pass(
    'Manual version persists through API saves; repeated labels keep separate PostgreSQL recovery snapshots without a migration',
  );
  for (let i = 0; i < 20; i++)
    await fetch(base + '/', {
      headers: {
        Authorization: 'Basic ' + Buffer.from('wrong:wrong').toString('base64'),
      },
    });
  assert.equal((await fetch(base + '/', { headers: auth })).status, 429);
  pass(
    'Repeated failed logins are rate-limited, including subsequent attempts',
  );
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  await pg.close();
}

const calls: { url: string; options?: RequestInit }[] = [];
const adapter = supabaseStore(
  'https://example.supabase.co',
  'sb_secret_TEST_NOT_REAL',
  async (url, options) => {
    const requestUrl =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push({ url: requestUrl, options });
    return Response.json(requestUrl.includes('/rpc/') ? true : []);
  },
);
assert.equal((await adapter.load()).revision, 0);
assert(await adapter.save(0, next, initialDocument));
assert.equal(
  new Headers(calls[0].options?.headers).get('apikey'),
  'sb_secret_TEST_NOT_REAL',
);
assert.equal(new Headers(calls[0].options?.headers).get('authorization'), null);
assert(calls[1].url.endsWith('/rest/v1/rpc/org_chart_save'));
const broken = supabaseStore(
  'https://example.supabase.co',
  'test',
  async () => new Response('no', { status: 500 }),
);
await assert.rejects(broken.load(), StorageError);
pass(
  'Supabase adapter keeps the key server-side and surfaces errors without falling back to an empty workspace',
);
for (const name of await readdir('selfhost-dist/client/assets')) {
  if (!name.endsWith('.js')) continue;
  const asset = await readFile('selfhost-dist/client/assets/' + name, 'utf8');
  assert(!asset.includes('Hetvi Manish Shah'));
  assert(!asset.includes('SUPABASE_SERVICE_ROLE_KEY'));
}
pass(
  'Public browser build contains neither seeded employee records nor server credentials',
);
console.log(
  `\n${passed} self-hosting checks passed. No live database was changed.`,
);
