import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response } from 'express';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './server-config';
import { resolveCookieSecurity, sessionCookieSameSite } from './cookies';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-me';

const readHeaderToken = (req: Request): string | undefined => {
  const raw = req.headers[CSRF_HEADER_NAME];
  return typeof raw === 'string' ? raw : raw?.[0];
};

const { secure, domain } = resolveCookieSecurity();

const csrfUtilities = doubleCsrf({
  getSecret: () => SESSION_SECRET,
  getSessionIdentifier: (req) => req.sessionID,
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions: {
    sameSite: sessionCookieSameSite,
    path: '/',
    secure,
    httpOnly: false,
    domain,
  },
  getCsrfTokenFromRequest: readHeaderToken,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

export const issueCsrfToken = (req: Request, res: Response, overwrite = false): string => {
  return csrfUtilities.generateCsrfToken(req, res, { overwrite });
};

export const isRequestCsrfValid = (req: Request): boolean => {
  return csrfUtilities.validateRequest(req);
};
