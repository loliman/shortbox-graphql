const ENV_SNAPSHOT = { ...process.env };

const loadServerConfigModule = () => {
  jest.resetModules();
  return require('../../src/core/server-config');
};

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
  jest.resetModules();
});

describe('server-config core', () => {
  it('uses safe defaults', () => {
    delete process.env.CORS_ALLOW_ALL_ORIGINS;
    delete process.env.CORS_FAIL_CLOSED;
    delete process.env.CSRF_PROTECTION_ENABLED;
    delete process.env.CSRF_COOKIE_NAME;
    delete process.env.CSRF_HEADER_NAME;
    delete process.env.CORS_ORIGIN;
    delete process.env.GRAPHQL_BODY_LIMIT_BYTES;

    const config = loadServerConfigModule();

    expect(config.CORS_ALLOW_ALL_ORIGINS).toBe(false);
    expect(config.CORS_FAIL_CLOSED).toBe(true);
    expect(config.CSRF_PROTECTION_ENABLED).toBe(true);
    expect(config.CSRF_COOKIE_NAME).toBe('sb_csrf');
    expect(config.CSRF_HEADER_NAME).toBe('x-csrf-token');
    expect(config.hasConfiguredCorsOrigins).toBe(false);
    expect(config.GRAPHQL_BODY_LIMIT_BYTES).toBe(1048576);
  });

  it('parses explicit environment configuration', () => {
    process.env.CORS_ALLOW_ALL_ORIGINS = 'true';
    process.env.CORS_FAIL_CLOSED = 'false';
    process.env.CSRF_PROTECTION_ENABLED = 'false';
    process.env.CSRF_COOKIE_NAME = 'csrf_cookie';
    process.env.CSRF_HEADER_NAME = 'X-CSRF-CUSTOM';
    process.env.CORS_ORIGIN = 'https://app.example,https://admin.example';
    process.env.GRAPHQL_BODY_LIMIT_BYTES = '2048';

    const config = loadServerConfigModule();

    expect(config.CORS_ALLOW_ALL_ORIGINS).toBe(true);
    expect(config.CORS_FAIL_CLOSED).toBe(false);
    expect(config.CSRF_PROTECTION_ENABLED).toBe(false);
    expect(config.CSRF_COOKIE_NAME).toBe('csrf_cookie');
    expect(config.CSRF_HEADER_NAME).toBe('x-csrf-custom');
    expect(config.hasConfiguredCorsOrigins).toBe(true);
    expect(config.GRAPHQL_BODY_LIMIT_BYTES).toBe(2048);
  });

  it('falls back when GRAPHQL_BODY_LIMIT_BYTES is invalid', () => {
    process.env.GRAPHQL_BODY_LIMIT_BYTES = 'invalid';

    const config = loadServerConfigModule();

    expect(config.GRAPHQL_BODY_LIMIT_BYTES).toBe(1048576);
  });
});
