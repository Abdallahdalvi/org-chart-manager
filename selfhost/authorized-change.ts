import { z } from 'zod';
import { prepareChange } from '../lib/changes';
import {
  documentControlEntries,
  documentSchema,
  normalize,
} from '../lib/organization';
import type { OrgDocument } from '../lib/model';
import type { WorkspaceSession } from '../lib/access';
import { AccessError } from './access-auth';

const requirePermission = (allowed: boolean) => {
  if (!allowed)
    throw new AccessError(
      'Your account does not have permission for this action.',
      403,
    );
};

export function authorizedChange(
  current: OrgDocument,
  body: Record<string, unknown>,
  session: WorkspaceSession,
): OrgDocument {
  if (session.mode !== 'cloudflare') return prepareChange(current, body);
  const actor = session.email;
  if (
    body.action === 'save' ||
    body.action === 'restore' ||
    body.action === 'document-control' ||
    body.action === 'reset-document-control'
  ) {
    requirePermission(session.canEdit);
    if (body.action === 'reset-document-control')
      return prepareChange(current, { ...body, actor });
    const next = documentSchema.parse(body.document);
    if (body.action === 'document-control' && !session.canManageApprovers) {
      const existing = new Map(
        documentControlEntries(current).map((entry) => [entry.contentId, entry]),
      );
      for (const entry of documentControlEntries(next)) {
        const prior = existing.get(entry.contentId);
        const approvalFields = [
          'validatedBy',
          'validatedDate',
          'approvedBy',
          'approvalDate',
        ] as const;
        if (
          approvalFields.some(
            (field) => (prior?.[field] || '') !== (entry[field] || ''),
          )
        )
          throw new AccessError(
            'Only HR full access can edit validation or approval fields.',
            403,
          );
      }
    }
    if (
      body.action === 'save' &&
      JSON.stringify(
        next.approvers.map((a) => [a.person, a.role, a.email || '']),
      ) !==
        JSON.stringify(
          current.approvers.map((a) => [a.person, a.role, a.email || '']),
        )
    )
      throw new AccessError(
        'Only HR can change the required reviewer list.',
        403,
      );
    // Restoring a chart must never replace the HR-controlled approval requirements.
    return prepareChange(current, {
      ...body,
      actor,
      document: { ...next, approvers: current.approvers },
    });
  }
  if (body.action === 'review-settings') {
    requirePermission(session.canManageApprovers);
    const settings = documentSchema
      .pick({ company: true, reviewDate: true, approvers: true })
      .parse(body.settings);
    if (!settings.approvers.length)
      throw new Error('At least one required stakeholder is needed.');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(settings.reviewDate) ||
      !Number.isFinite(Date.parse(settings.reviewDate))
    )
      throw new Error('Use a valid next review date.');
    const keys = settings.approvers.map(
      (a) => `${normalize(a.person)}|${normalize(a.role)}`,
    );
    if (new Set(keys).size !== keys.length)
      throw new Error('Duplicate required stakeholder.');
    return prepareChange(current, {
      action: 'save',
      actor,
      document: { ...current, ...settings },
      description:
        'HR updated document settings and required reviewers; fresh validation and approvals are required.',
    });
  }
  if (body.action === 'validate' || body.action === 'approve') {
    requirePermission(
      body.action === 'validate' ? session.canValidate : session.canApprove,
    );
    if (body.confirm !== true)
      throw new Error('Confirm that you reviewed this version before signing.');
    const now = new Date().toISOString();
    let person = actor,
      role = 'HR';
    if (body.action === 'approve') {
      const index = z.number().int().nonnegative().parse(body.approverIndex);
      const assignment = current.approvers[index];
      if (!assignment || assignment.email?.toLowerCase() !== actor)
        throw new AccessError(
          'You may only approve a required stakeholder entry assigned to your verified email.',
          403,
        );
      ({ person, role } = assignment);
    }
    return prepareChange(current, {
      action: 'evidence',
      actor,
      evidence: {
        id: crypto.randomUUID(),
        version: current.version,
        kind:
          body.action === 'validate' ? 'HR validation' : 'Stakeholder approval',
        person,
        role,
        date: now.slice(0, 10),
        reference: `Cloudflare Access confirmation by ${actor} at ${now}; workspace save ${String(body.revision)}`,
        note: z
          .string()
          .trim()
          .max(2000)
          .parse(body.note || ''),
        recordedBy: actor,
      },
    });
  }
  if (body.action === 'external-approval') {
    requirePermission(session.canManageApprovers);
    const evidence = z.record(z.string(), z.unknown()).parse(body.evidence);
    return prepareChange(current, {
      action: 'evidence',
      actor,
      evidence: {
        person: evidence.person,
        role: evidence.role,
        date: evidence.date,
        note: evidence.note || '',
        id: crypto.randomUUID(),
        version: current.version,
        kind: 'Stakeholder approval',
        recordedBy: actor,
        reference: `External evidence (recorded by HR): ${z.string().trim().min(1).max(1900).parse(evidence.reference)}`,
      },
    });
  }
  // Includes legacy evidence APIs: they cannot bypass the authenticated review actions.
  throw new AccessError(
    'This action is not available to your signed-in account.',
    403,
  );
}
