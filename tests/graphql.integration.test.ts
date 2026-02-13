import request from 'supertest';
import { startServer } from '../src/core/server';
import { resetAndSeedDatabase } from './integration/seed';

describe('GraphQL Integration Tests', () => {
  let url: string;
  let serverInstance: { stop: () => Promise<void> } | null = null;

  beforeAll(async () => {
    await resetAndSeedDatabase();
    const result = await startServer(4101);
    url = result.url;
    serverInstance = result.server;
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.stop();
    }
  }, 30000);

  it('fetches seeded publishers', async () => {
    const query = {
      query: `
        query {
          publishers(us: true) {
            edges {
              node {
                name
              }
            }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.publishers.edges.length).toBeGreaterThan(0);
    expect(response.body.data.publishers.edges[0].node.name).toBe('Marvel Comics');
  });

  it('fetches seeded series by pattern', async () => {
    const query = {
      query: `
        query {
          series(pattern: "Spider", publisher: { name: "Marvel Comics", us: true }) {
            edges {
              node {
                title
                volume
              }
            }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.series.edges.length).toBeGreaterThan(0);
    expect(response.body.data.series.edges[0].node.title).toBe('Spider-Man');
  });

  it('fetches issue by IssueInput', async () => {
    const query = {
      query: `
        query {
          issue(issue: {
            number: "1",
            series: {
              title: "Spider-Man",
              volume: 1,
              publisher: { name: "Marvel Comics" }
            }
          }) {
            number
            series {
              title
            }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.issue.number).toBe('1');
    expect(response.body.data.issue.series.title).toBe('Spider-Man');
  });

  it('returns UNAUTHENTICATED for protected mutation', async () => {
    const mutation = {
      query: `
        mutation {
          deleteSeries(item: { title: "Spider-Man", volume: 1, publisher: { name: "Marvel Comics" } })
        }
      `,
    };

    const response = await request(url).post('/').send(mutation);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('returns lastEdited entries with nested fields', async () => {
    const query = {
      query: `
        query {
          lastEdited(filter: { us: true }, limit: 2, order: "createdAt", direction: "ASC") {
            number
            variant
            createdAt
            updatedAt
            series { title }
            stories { number }
            cover { id }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.lastEdited)).toBe(true);
    expect(response.body.data.lastEdited.length).toBeGreaterThan(0);
    expect(response.body.data.lastEdited[0].series.title).toBe('Spider-Man');
  });

  it('returns variants for an issue', async () => {
    const query = {
      query: `
        query {
          lastEdited(limit: 1) {
            number
            variants {
              variant
            }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.lastEdited.length).toBe(1);
    expect(Array.isArray(response.body.data.lastEdited[0].variants)).toBe(true);
  });
});
