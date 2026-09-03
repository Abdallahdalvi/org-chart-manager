import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { supabaseStore } from './store';
import { createAccessAuthenticator, readAccessConfig } from './access-auth';

function required(name: string) {
  const value = process.env[name];
  if (!value || value.startsWith('replace-'))
    throw new Error(`Set ${name} in your self-hosting environment.`);
  return value;
}
const origin = new URL(required('APP_ORIGIN'));
if (
  !['https:', 'http:'].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== '/'
)
  throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path.');
if (
  origin.protocol === 'http:' &&
  !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
)
  throw new Error(
    'Use an HTTPS APP_ORIGIN outside localhost to protect employee data and login credentials.',
  );
const database = new URL(required('SUPABASE_URL'));
if (
  database.protocol !== 'https:' &&
  !(database.protocol === 'http:' && process.env.SUPABASE_ALLOW_HTTP === 'true')
)
  throw new Error(
    'Use HTTPS for Supabase, or explicitly enable SUPABASE_ALLOW_HTTP for your private Docker network.',
  );
if (
  database.username ||
  database.password ||
  database.search ||
  database.hash ||
  database.pathname !== '/'
)
  throw new Error(
    'SUPABASE_URL must be the Supabase API origin, without a path.',
  );
const mode = process.env.APP_AUTH_MODE || 'basic';
if (!['basic', 'cloudflare'].includes(mode))
  throw new Error('APP_AUTH_MODE must be basic or cloudflare.');
if (mode === 'cloudflare' && origin.protocol !== 'https:')
  throw new Error('Cloudflare Access requires an HTTPS APP_ORIGIN.');
const access =
  mode === 'cloudflare'
    ? createAccessAuthenticator(readAccessConfig(process.env))
    : undefined;
const username = mode === 'basic' ? required('APP_USERNAME') : undefined;
const password = mode === 'basic' ? required('APP_PASSWORD') : undefined;
if (mode === 'basic' && (username!.includes(':') || password!.length < 16))
  throw new Error(
    'Use a username without a colon and a password of at least 16 characters.',
  );
const port = Number(process.env.PORT || 3080);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT.');
const server = createApp(
  {
    origin: origin.origin,
    username,
    password,
    access,
    clientDir: fileURLToPath(new URL('../client/', import.meta.url)),
  },
  supabaseStore(database.origin, required('SUPABASE_SERVICE_ROLE_KEY')),
);
server.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(
    `Ubiqedge server ready on port ${port}. Database: Supabase. Authentication: ${mode}.`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
