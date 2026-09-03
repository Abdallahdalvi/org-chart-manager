import { z } from 'zod';
import type { OrgDocument } from './model';
import {
  documentSchema,
  evolve,
  recordEvidence,
  resetDocumentControl,
  updateDocumentControl,
} from './organization';

/** Shared validation for the local/Sites and CasaOS storage backends. */
export function prepareChange(
  current: OrgDocument,
  body: Record<string, unknown>,
): OrgDocument {
  if (
    !['save', 'restore', 'evidence', 'document-control', 'reset-document-control'].includes(
      String(body.action),
    )
  )
    throw new Error('Unknown workspace action.');
  const actor = z.string().trim().min(1).max(150).parse(body.actor);
  const next =
    body.action === 'evidence'
      ? recordEvidence(current, {
          ...z.record(z.string(), z.unknown()).parse(body.evidence),
          recordedBy: actor,
        } as Parameters<typeof recordEvidence>[1])
      : body.action === 'reset-document-control'
        ? resetDocumentControl(current, actor)
        : body.action === 'document-control'
          ? updateDocumentControl(
              current,
              documentSchema.parse(body.document),
              actor,
              z.string().trim().min(1).max(2000).parse(body.description),
            )
          : evolve(
          current,
          documentSchema.parse(body.document),
          actor,
          z.string().trim().min(1).max(2000).parse(body.description),
          true,
        );
  if (body.action === 'restore') {
    const backup = documentSchema.parse(body.document);
    const prefix = 'backup ' + backup.version + ' / ';
    next.evidence = [
      ...current.evidence,
      ...backup.evidence.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        version: prefix + e.version,
      })),
    ];
    next.history = [
      ...next.history,
      ...backup.history.map((h) => ({ ...h, version: prefix + h.version })),
    ];
  }
  documentSchema.parse(next);
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 1500000)
    throw new Error(
      'Workspace is too large; export an archive before continuing.',
    );
  return next;
}
