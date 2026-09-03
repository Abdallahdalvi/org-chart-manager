// Read-only check; accepts a local environment file or the supplied setup transcript.
// Never prints credentials or reads employee records.
import { readFile } from 'node:fs/promises';
const text = process.argv[2] ? await readFile(process.argv[2], 'utf8') : '';
const values = Object.fromEntries(
  text
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const index = line.indexOf('=');
      return [
        line.slice(0, index),
        line.slice(index + 1).replace(/^["']|["']$/g, ''),
      ];
    }),
);
const url =
  process.env.SUPABASE_URL || values.SUPABASE_URL || values.SUPABASE_PUBLIC_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  values.SUPABASE_SERVICE_ROLE_KEY ||
  values.SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    'Supply the local setup file or set the Supabase server environment variables.',
  );
try {
  const response = await fetch(
    `${new URL(url).origin}/rest/v1/org_chart_documents?select=revision&limit=1`,
    {
      headers: {
        apikey: key,
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      status: response.status,
      connected: response.ok,
      schemaReady: response.ok,
      databaseCode: data.code || null,
    }),
  );
  if (!response.ok) process.exitCode = 1;
} catch {
  console.error(
    'Could not reach the configured Supabase API. No data was changed.',
  );
  process.exitCode = 1;
}
