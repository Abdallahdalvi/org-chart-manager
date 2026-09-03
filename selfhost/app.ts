import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { z } from 'zod';
import { prepareChange } from '../lib/changes';
import { StorageError, type Store } from './store';

export type AppConfig = {
  origin: string;
  username: string;
  password: string;
  clientDir: string;
};
const digest = (value: string) => createHash('sha256').update(value).digest();
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function readBody(req: IncomingMessage) {
  if (Number(req.headers['content-length'] || 0) > 1500000)
    throw new RequestError('Workspace too large.', 413);
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new RequestError('JSON required.', 415);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 1500000) throw new RequestError('Workspace too large.', 413);
    chunks.push(bytes);
  }
  return z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}
export function createApp(config: AppConfig, store: Store) {
  const expected = digest(`${config.username}:${config.password}`);
  const failures = new Map<string, { count: number; until: number }>();
  const clientRoot = resolve(config.clientDir);
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(JSON.stringify(data));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    if (config.origin.startsWith('https:'))
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url || '/', config.origin);
      if (url.pathname === '/healthz' && req.method === 'GET')
        return json(res, 200, { ok: true });
      const credential = req.headers.authorization || '';
      const address = req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      for (const [ip, record] of failures)
        if (record.until <= now) failures.delete(ip);
      const attempt = failures.get(address);
      if (attempt && attempt.count >= 20) {
        res.setHeader('Retry-After', '60');
        return json(res, 429, {
          error: 'Too many login attempts. Try again in a minute.',
        });
      }
      const supplied = credential.startsWith('Basic ')
        ? Buffer.from(credential.slice(6), 'base64').toString('utf8')
        : '';
      if (!timingSafeEqual(expected, digest(supplied))) {
        // Deliberately ignore spoofable forwarding headers. Configure proxy rate limiting too.
        const record = failures.get(address) || {
          count: 0,
          until: now + 60000,
        };
        if (credential) record.count++;
        if (failures.size < 1000 || failures.has(address))
          failures.set(address, record);
        res.setHeader(
          'WWW-Authenticate',
          'Basic realm="Ubiqedge organization chart", charset="UTF-8"',
        );
        return json(res, 401, {
          error:
            'Sign in with the username and password configured on your server.',
        });
      }
      failures.delete(address);
      if (req.method === 'PUT') {
        if (req.headers.origin !== config.origin)
          throw new RequestError('Same-origin requests required.', 403);
      }
      if (url.pathname === '/api/document') {
        if (req.method === 'GET') return json(res, 200, await store.load());
        if (req.method !== 'PUT')
          throw new RequestError('Method not allowed.', 405);
        const body = await readBody(req);
        const revision = z.number().int().nonnegative().parse(body.revision);
        const current = await store.load();
        if (revision !== current.revision)
          throw new RequestError(
            'Another edit was saved. Reload before editing; your change was not applied.',
            409,
          );
        const document = prepareChange(current.document, body);
        if (!(await store.save(revision, document, current.document)))
          throw new RequestError(
            'Another editor saved first. Reload to see the latest chart.',
            409,
          );
        return json(res, 200, { revision: revision + 1, document });
      }
      if (url.pathname === '/api/revisions' && req.method === 'GET') {
        const id = url.searchParams.get('revision');
        if (id !== null) {
          if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)))
            throw new RequestError('Invalid revision.', 400);
          const doc = await store.snapshot(Number(id));
          return json(
            res,
            doc ? 200 : 404,
            doc || { error: 'Revision not found.' },
          );
        }
        return json(res, 200, await store.revisions());
      }
      if (url.pathname.startsWith('/api/'))
        throw new RequestError('Not found.', 404);
      if (!['GET', 'HEAD'].includes(req.method || ''))
        throw new RequestError('Method not allowed.', 405);
      const pathname = decodeURIComponent(url.pathname);
      const file = resolve(
        clientRoot,
        '.' + (pathname === '/' ? '/index.html' : pathname),
      );
      if (
        !file.startsWith(clientRoot + sep) ||
        pathname.includes('\\') ||
        pathname.split('/').some((part) => part.startsWith('.') && part !== '')
      )
        throw new RequestError('Not found.', 404);
      try {
        if (!(await stat(file)).isFile()) throw new Error();
      } catch {
        throw new RequestError('Not found.', 404);
      }
      let data = await readFile(file);
      if (file.endsWith('index.html'))
        data = Buffer.from(
          data.toString().replaceAll('__APP_ORIGIN__', config.origin),
        );
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Content-Length': data.length,
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) {
      if (res.headersSent) {
        res.end();
        return;
      }
      json(
        res,
        e instanceof RequestError
          ? e.status
          : e instanceof StorageError
            ? 503
            : 400,
        {
          error:
            e instanceof Error ? e.message : 'Could not complete this request.',
        },
      );
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
