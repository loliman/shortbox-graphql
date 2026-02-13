const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const CORS_ALLOW_ALL_ORIGINS =
  (process.env.CORS_ALLOW_ALL_ORIGINS || '').toLowerCase() === 'true';
export const CORS_FAIL_CLOSED = (process.env.CORS_FAIL_CLOSED || 'true').toLowerCase() !== 'false';
export const CSRF_PROTECTION_ENABLED =
  (process.env.CSRF_PROTECTION_ENABLED || 'true').toLowerCase() !== 'false';
export const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'sb_csrf';
export const CSRF_HEADER_NAME = (process.env.CSRF_HEADER_NAME || 'x-csrf-token').toLowerCase();
export const hasConfiguredCorsOrigins = configuredCorsOrigins.length > 0;

const parsedBodyLimitBytes = parseInt(process.env.GRAPHQL_BODY_LIMIT_BYTES || '1048576', 10);
export const GRAPHQL_BODY_LIMIT_BYTES = Number.isFinite(parsedBodyLimitBytes)
  ? parsedBodyLimitBytes
  : 1048576;
