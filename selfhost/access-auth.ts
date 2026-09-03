import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import {
  emailSession,
  type WorkspaceRole,
  type WorkspaceSession,
} from '../lib/access';

export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export type RoleEmails = Record<WorkspaceRole, string[]>;
export type AccessConfig = {
  teamDomain: string;
  audience: string;
  emails: RoleEmails;
};
export type AccessAuthenticator = (
  token: string | undefined,
) => Promise<WorkspaceSession>;

export function readAccessConfig(
  env: Record<string, string | undefined>,
): AccessConfig {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN || '';
  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(teamDomain)
  )
    throw new Error(
      'Set CF_ACCESS_TEAM_DOMAIN to your exact team hostname, without https:// or a path.',
    );
  const audience = env.CF_ACCESS_AUD || '';
  if (!/^[a-fA-F0-9]{64}$/.test(audience))
    throw new Error(
      'Set CF_ACCESS_AUD to this Access application’s 64-character Application Audience (AUD) Tag.',
    );
  const emails = Object.fromEntries(
    (['editor', 'hr', 'approver', 'viewer'] as const).map((role) => {
      const values = (env[`APP_${role.toUpperCase()}_EMAILS`] || '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      for (const value of values) z.email().max(150).parse(value);
      return [role, [...new Set(values)]];
    }),
  ) as RoleEmails;
  if (!Object.values(emails).some((list) => list.length))
    throw new Error(
      'Configure at least one exact email in the server role lists.',
    );
  return { teamDomain, audience, emails };
}

export function createAccessAuthenticator(
  config: AccessConfig,
  testKeys?: JWTVerifyGetKey,
): AccessAuthenticator {
  // Key URL comes only from validated server configuration, never from token claims or headers.
  const checked = readAccessConfig({
    CF_ACCESS_TEAM_DOMAIN: config.teamDomain,
    CF_ACCESS_AUD: config.audience,
    ...Object.fromEntries(
      Object.entries(config.emails).map(([role, emails]) => [
        `APP_${role.toUpperCase()}_EMAILS`,
        emails.join(','),
      ]),
    ),
  });
  const issuer = `https://${checked.teamDomain}`;
  const keys =
    testKeys ||
    createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    });
  return async (token) => {
    if (!token || token.length > 16000)
      throw new AccessError(
        'Sign in through the protected Cloudflare Access address.',
        401,
      );
    let email: string;
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: checked.audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'email'],
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub.trim() ||
        typeof payload.iat !== 'number' ||
        payload.iat > Date.now() / 1000 + 5 ||
        typeof payload.email !== 'string' ||
        payload.type === 'service'
      )
        throw new Error();
      email = z.email().max(150).parse(payload.email.trim().toLowerCase());
    } catch {
      throw new AccessError(
        'Cloudflare sign-in is missing, expired, or invalid. Reopen the app to sign in again.',
        401,
      );
    }
    const roles = (Object.keys(checked.emails) as WorkspaceRole[]).filter(
      (role) => checked.emails[role].includes(email),
    );
    if (!roles.length)
      throw new AccessError(
        'Your email has no role in this workspace. Contact the server administrator.',
        403,
      );
    return emailSession(email, roles);
  };
}
