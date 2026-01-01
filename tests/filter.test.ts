import request from 'supertest';
import { startServer } from '../src/core/server';

describe('FilterService Integration Tests', () => {
  let url: string;
  let serverInstance: any;

  beforeAll(async () => {
    const result = await startServer(4005);
    url = result.url;
    serverInstance = result.server;
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.stop();
    }
  });

  it('should export filter results as txt', async () => {
    const query = {
      query: `
        query {
          export(filter: { us: true }, type: "txt")
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.export).toBeDefined();
    expect(typeof response.body.data.export).toBe('string');
  });

  it('should export filter results as csv', async () => {
    const query = {
      query: `
        query {
          export(filter: { us: true }, type: "csv")
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.export).toBeDefined();
    expect(response.body.data.export).toContain('Verlag;Series;Volume');
  });

  it('should return error for invalid export type', async () => {
    const query = {
      query: `
        query {
          export(filter: { us: true }, type: "pdf")
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].message).toContain('Gültige Export Typen: txt, csv');
  });
});
