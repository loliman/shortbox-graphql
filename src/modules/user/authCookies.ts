import type { ServerResponse } from 'http';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sb_session';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'sb_csrf';
const parsedMaxAge = parseInt(process.env.SESSION_COOKIE_MAX_AGE_SECONDS || '1209600', 10);
const SESSION_COOKIE_MAX_AGE_SECONDS = Number.isFinite(parsedMaxAge) ? parsedMaxAge : 1209600;
const parsedCsrfMaxAge = parseInt(
  process.env.CSRF_COOKIE_MAX_AGE_SECONDS || String(SESSION_COOKIE_MAX_AGE_SECONDS),
  10,
);
const CSRF_COOKIE_MAX_AGE_SECONDS = Number.isFinite(parsedCsrfMaxAge)
  ? parsedCsrfMaxAge
  : SESSION_COOKIE_MAX_AGE_SECONDS;
const SESSION_COOKIE_SAME_SITE = (() => {
  const configured = (process.env.SESSION_COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
  if (configured === 'strict') return 'Strict';
  if (configured === 'none') return 'None';
  return 'Lax';
})();

const cookieSecurityConfig = (): { secure: boolean; domain?: string } => {
  const secureByEnv = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const secure = SESSION_COOKIE_SAME_SITE === 'None' ? true : secureByEnv;
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  return { secure, domain };
};

export const appendSetCookie = (response: ServerResponse | undefined, cookieValue: string) => {
  if (!response) return;
  const existing = response.getHeader('Set-Cookie');
  if (!existing) {
    response.setHeader('Set-Cookie', [cookieValue]);
    return;
  }

  const current = Array.isArray(existing) ? existing.map(String) : [String(existing)];
  response.setHeader('Set-Cookie', [...current, cookieValue]);
};

export const buildSessionCookie = (token: string) => {
  const { secure, domain } = cookieSecurityConfig();
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

export const buildExpiredSessionCookie = () => {
  const { secure, domain } = cookieSecurityConfig();
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

export const buildCsrfCookie = (token: string) => {
  const { secure, domain } = cookieSecurityConfig();
  const parts = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${CSRF_COOKIE_MAX_AGE_SECONDS}`,
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

export const buildExpiredCsrfCookie = () => {
  const { secure, domain } = cookieSecurityConfig();
  const parts = [
    `${CSRF_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};
