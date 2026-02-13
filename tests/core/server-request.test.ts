import { parseRequestIp } from '../../src/core/server-request';

describe('server-request core', () => {
  it('prefers first forwarded ip from comma-separated header', () => {
    const request = {
      headers: { 'x-forwarded-for': '10.1.1.1, 10.1.1.2' },
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    expect(parseRequestIp(request)).toBe('10.1.1.1');
  });

  it('supports array style forwarded header', () => {
    const request = {
      headers: { 'x-forwarded-for': ['172.16.0.2, 172.16.0.3'] },
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    expect(parseRequestIp(request)).toBe('172.16.0.2');
  });

  it('falls back to remote address when forwarded header is absent', () => {
    const request = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    expect(parseRequestIp(request)).toBe('127.0.0.1');
  });
});
