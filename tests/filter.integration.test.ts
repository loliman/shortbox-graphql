import request from 'supertest';
import { startServer } from '../src/core/server';
import { resetAndSeedDatabase } from './integration/seed';

describe('Filter Integration Tests', () => {
  let url: string;
  let serverInstance: { stop: () => Promise<void> } | null = null;

  beforeAll(async () => {
    await resetAndSeedDatabase();
    const result = await startServer(4102);
    url = result.url;
    serverInstance = result.server;
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.stop();
    }
  }, 30000);

  it('exports filtered issues as txt', async () => {
    const query = {
      query: `
        query {
          export(filter: { us: true }, type: "txt")
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(typeof response.body.data.export).toBe('string');
    expect(response.body.data.export).toContain('Spider-Man');
  });

  it('exports filtered issues as csv', async () => {
    const query = {
      query: `
        query {
          export(filter: { us: true }, type: "csv")
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(typeof response.body.data.export).toBe('string');
    expect(response.body.data.export).toContain('Verlag;Series;Volume');
    expect(response.body.data.export).toContain('Marvel Comics');
  });

  it('returns BAD_USER_INPUT for unsupported export type', async () => {
    const query = {
      query: `
        query {
          export(filter: { us: true }, type: "pdf")
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  });
});
