export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sb_session';

export const sessionCookieSameSite: 'lax' | 'strict' | 'none' = (() => {
  const configured = (process.env.SESSION_COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
  if (configured === 'strict') return 'strict';
  if (configured === 'none') return 'none';
  return 'lax';
})();

export const resolveCookieSecurity = (): { secure: boolean; domain?: string } => {
  const secureByEnv =
    process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const secure = sessionCookieSameSite === 'none' ? true : secureByEnv;
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  return { secure, domain };
};
