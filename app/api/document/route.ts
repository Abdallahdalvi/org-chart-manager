import { db } from '@/lib/database';
import { SITE_ORIGIN } from '@/lib/site-config';
import { initialDocument } from '@/lib/seed';
import { documentSchema, evolve, recordEvidence } from '@/lib/organization';
import { z } from 'zod';
export async function GET() {
  try {
    const row = await db()
      .prepare('SELECT revision,data FROM documents WHERE id = ?')
      .bind('company')
      .first<{ revision: number; data: string }>();
    return Response.json(
      row
        ? { revision: row.revision, document: JSON.parse(row.data) }
        : { revision: 0, document: initialDocument },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        error:
          'The saved workspace could not be loaded. Please retry; no changes have been made.',
      },
      { status: 503 },
    );
  }
}
export async function PUT(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || ![new URL(request.url).origin, SITE_ORIGIN].includes(origin))
    return Response.json(
      { error: 'Same-origin requests required.' },
      { status: 403 },
    );
  if (Number(request.headers.get('content-length') || 0) > 1500000)
    return Response.json(
      { error: 'Workspace exceeds the supported size.' },
      { status: 413 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 1500000)
      return Response.json({ error: 'Workspace too large.' }, { status: 413 });
    const body = JSON.parse(raw),
      revision = z.number().int().nonnegative().parse(body.revision);
    const row = await db()
      .prepare('SELECT revision,data FROM documents WHERE id = ?')
      .bind('company')
      .first<{ revision: number; data: string }>();
    if ((row?.revision || 0) !== revision)
      return Response.json(
        {
          error:
            'A newer edit was saved in another tab. Keep a copy of your form values, then reload before editing.',
        },
        { status: 409 },
      );
    const current = row
      ? documentSchema.parse(JSON.parse(row.data))
      : initialDocument;
    if (!['save', 'restore', 'evidence'].includes(body.action))
      throw new Error('Unknown workspace action.');
    const actor = z.string().trim().min(1).max(150).parse(body.actor);
    const next =
      body.action === 'evidence'
        ? recordEvidence(current, { ...body.evidence, recordedBy: actor })
        : evolve(
            current,
            documentSchema.parse(body.document),
            actor,
            String(body.description || ''),
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
      documentSchema.parse(next);
    }
    const encoded = JSON.stringify(next);
    if (encoded.length > 1500000)
      throw new Error(
        'Workspace is too large; export an archive before continuing.',
      );
    // Revision check is repeated in the atomic write, preventing lost updates.
    const result = await db().batch([
      db()
        .prepare(
          'INSERT INTO documents (id,revision,data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, data = excluded.data WHERE documents.revision = ?',
        )
        .bind('company', revision + 1, encoded, revision),
      db()
        .prepare(
          'INSERT OR IGNORE INTO snapshots (revision,version,date,data) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND revision = ? AND data = ?)',
        )
        .bind(
          revision + 1,
          next.version,
          new Date().toISOString(),
          encoded,
          'company',
          revision + 1,
          encoded,
        ),
      db()
        .prepare(
          'INSERT OR IGNORE INTO snapshots (revision,version,date,data) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND revision = ? AND data = ?)',
        )
        .bind(
          revision,
          current.version,
          current.updatedDate,
          JSON.stringify(current),
          'company',
          revision + 1,
          encoded,
        ),
    ]);
    if (!result[0].meta.changes)
      return Response.json(
        {
          error: 'Another editor saved first. Reload to load the latest chart.',
        },
        { status: 409 },
      );
    return Response.json({ revision: revision + 1, document: next });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Could not save this change.' },
      { status: 400 },
    );
  }
}
