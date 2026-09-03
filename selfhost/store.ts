import type { OrgDocument } from '../lib/model';
import { initialDocument } from '../lib/seed';
import { documentSchema } from '../lib/organization';
export type Saved = { revision: number; document: OrgDocument };
export type Snapshot = { revision: number; version: string; date: string };
export interface Store {
  load(): Promise<Saved>;
  save(
    expected: number,
    document: OrgDocument,
    previous: OrgDocument,
  ): Promise<boolean>;
  revisions(): Promise<Snapshot[]>;
  snapshot(revision: number): Promise<OrgDocument | null>;
}
export class StorageError extends Error {}
export function supabaseStore(
  url: string,
  key: string,
  request: typeof fetch = fetch,
): Store {
  async function rest(path: string, body?: unknown) {
    try {
      const result = await request(`${url}/rest/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: key,
          ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
      if (!result.ok) throw new Error('Storage request failed');
      return await result.json();
    } catch {
      throw new StorageError(
        'Supabase is unavailable. Check the server configuration and database setup. No successful save has been confirmed.',
      );
    }
  }
  return {
    async load() {
      const rows = await rest(
        'org_chart_documents?id=eq.company&select=revision,data',
      );
      if (!Array.isArray(rows))
        throw new StorageError('Unexpected database response.');
      return rows.length
        ? {
            revision: Number(rows[0].revision),
            document: documentSchema.parse(rows[0].data),
          }
        : { revision: 0, document: structuredClone(initialDocument) };
    },
    async save(expected, document, previous) {
      const result = await rest('rpc/org_chart_save', {
        p_expected_revision: expected,
        p_document: document,
        p_previous_document: previous,
      });
      if (typeof result !== 'boolean')
        throw new StorageError(
          'Unexpected save response. Reload the chart before trying again.',
        );
      return result;
    },
    async revisions() {
      const rows = await rest(
        'org_chart_snapshots?select=revision,version,date&order=revision.desc&limit=250',
      );
      if (!Array.isArray(rows))
        throw new StorageError('Unexpected database response.');
      return rows as Snapshot[];
    },
    async snapshot(revision) {
      const rows = await rest(
        `org_chart_snapshots?revision=eq.${revision}&select=data`,
      );
      if (!Array.isArray(rows))
        throw new StorageError('Unexpected database response.');
      return rows[0] ? documentSchema.parse(rows[0].data) : null;
    },
  };
}
