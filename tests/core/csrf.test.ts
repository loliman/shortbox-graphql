const ENV_SNAPSHOT = { ...process.env };

type CsrfModuleOptions = {
  sessionSecret?: string;
  headerName?: string;
  cookieName?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  cookieSecurity?: { secure: boolean; domain?: string };
  generatedToken?: string;
  requestValid?: boolean;
};

const loadCsrfModule = (options: CsrfModuleOptions = {}) => {
  process.env = { ...ENV_SNAPSHOT };
  if (typeof options.sessionSecret === 'string') process.env.SESSION_SECRET = options.sessionSecret;
  else delete process.env.SESSION_SECRET;

  jest.resetModules();

  const generateCsrfToken = jest
    .fn()
    .mockReturnValue(options.generatedToken || 'generated-csrf-token');
  const validateRequest = jest.fn().mockReturnValue(options.requestValid ?? true);
  const doubleCsrf = jest.fn().mockReturnValue({
    generateCsrfToken,
    validateRequest,
  });

  jest.doMock('csrf-csrf', () => ({
    doubleCsrf,
  }));
  jest.doMock('../../src/core/server-config', () => ({
    CSRF_COOKIE_NAME: options.cookieName || 'sb_csrf',
    CSRF_HEADER_NAME: options.headerName || 'x-csrf-token',
  }));
  jest.doMock('../../src/core/cookies', () => ({
    resolveCookieSecurity: () => options.cookieSecurity || { secure: false, domain: undefined },
    sessionCookieSameSite: options.sameSite || 'lax',
  }));

  const csrf = require('../../src/core/csrf');

  return { csrf, doubleCsrf, generateCsrfToken, validateRequest };
};

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
  jest.resetModules();
  jest.clearAllMocks();
});

describe('csrf core', () => {
  it('configures doubleCsrf with cookie and request-header settings', () => {
    const { doubleCsrf } = loadCsrfModule({
      sessionSecret: 'top-secret',
      headerName: 'x-csrf-custom',
      cookieName: 'csrf_cookie',
      sameSite: 'strict',
      cookieSecurity: { secure: true, domain: 'shortbox.example' },
    });

    expect(doubleCsrf).toHaveBeenCalledTimes(1);
    const config = doubleCsrf.mock.calls[0][0];

    expect(config.getSecret()).toBe('top-secret');
    expect(config.cookieName).toBe('csrf_cookie');
    expect(config.getSessionIdentifier({ sessionID: 'session-1' })).toBe('session-1');
    expect(config.ignoredMethods).toEqual(['GET', 'HEAD', 'OPTIONS']);
    expect(config.cookieOptions).toEqual({
      sameSite: 'strict',
      path: '/',
      secure: true,
      httpOnly: false,
      domain: 'shortbox.example',
    });

    expect(config.getCsrfTokenFromRequest({ headers: { 'x-csrf-custom': 'abc' } })).toBe('abc');
    expect(config.getCsrfTokenFromRequest({ headers: { 'x-csrf-custom': ['first', 'second'] } })).toBe(
      'first',
    );
    expect(config.getCsrfTokenFromRequest({ headers: {} })).toBeUndefined();
  });

  it('falls back to a development secret when SESSION_SECRET is missing', () => {
    const { doubleCsrf } = loadCsrfModule();
    const config = doubleCsrf.mock.calls[0][0];

    expect(config.getSecret()).toBe('dev-only-change-me');
  });

  it('delegates issueCsrfToken to generateCsrfToken with overwrite flag', () => {
    const { csrf, generateCsrfToken } = loadCsrfModule({ generatedToken: 'issued-token' });

    const req = { requestId: 'r1' };
    const res = { responseId: 'p1' };

    expect(csrf.issueCsrfToken(req, res)).toBe('issued-token');
    expect(generateCsrfToken).toHaveBeenNthCalledWith(1, req, res, { overwrite: false });

    csrf.issueCsrfToken(req, res, true);
    expect(generateCsrfToken).toHaveBeenNthCalledWith(2, req, res, { overwrite: true });
  });

  it('delegates request validation to validateRequest', () => {
    const { csrf, validateRequest } = loadCsrfModule({ requestValid: false });
    const req = { headers: { 'x-csrf-token': 'invalid' } };

    expect(csrf.isRequestCsrfValid(req)).toBe(false);
    expect(validateRequest).toHaveBeenCalledWith(req);
  });
});
