const ENV_SNAPSHOT = { ...process.env };

const loadCookiesModule = () => {
  jest.resetModules();
  return require('../../src/core/cookies');
};

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
  jest.resetModules();
});

describe('cookies core', () => {
  it('defaults to lax and non-secure cookies in local mode', () => {
    delete process.env.SESSION_COOKIE_SAME_SITE;
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.NODE_ENV;
    delete process.env.SESSION_COOKIE_DOMAIN;

    const cookies = loadCookiesModule();

    expect(cookies.sessionCookieSameSite).toBe('lax');
    expect(cookies.resolveCookieSecurity()).toEqual({ secure: false, domain: undefined });
  });

  it('forces secure cookies when sameSite is none', () => {
    process.env.SESSION_COOKIE_SAME_SITE = 'none';
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.NODE_ENV;

    const cookies = loadCookiesModule();

    expect(cookies.sessionCookieSameSite).toBe('none');
    expect(cookies.resolveCookieSecurity().secure).toBe(true);
  });

  it('honors explicit secure and cookie domain settings', () => {
    process.env.SESSION_COOKIE_SAME_SITE = 'lax';
    process.env.SESSION_COOKIE_SECURE = 'true';
    process.env.SESSION_COOKIE_DOMAIN = ' shortbox.example ';

    const cookies = loadCookiesModule();

    expect(cookies.resolveCookieSecurity()).toEqual({
      secure: true,
      domain: 'shortbox.example',
    });
  });

  it('defaults cookie domain to shortbox.de in production when unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_COOKIE_DOMAIN;

    const cookies = loadCookiesModule();

    expect(cookies.resolveCookieSecurity()).toEqual({
      secure: true,
      domain: 'shortbox.de',
    });
  });
});
