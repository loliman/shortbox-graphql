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
          publisherList(us: true) {
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
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.publisherList.edges.length).toBeGreaterThan(0);
    expect(response.body.data.publisherList.edges[0].node.name).toBe('Marvel Comics');
  });

  it('fetches seeded series by pattern', async () => {
    const query = {
      query: `
        query {
          seriesList(pattern: "Spider", publisher: { name: "Marvel Comics", us: true }) {
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
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.seriesList.edges.length).toBeGreaterThan(0);
    expect(response.body.data.seriesList.edges[0].node.title).toBe('Spider-Man');
  });

  it('fetches issue by IssueInput', async () => {
    const query = {
      query: `
        query {
          issueDetails(issue: {
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
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.issueDetails.number).toBe('1');
    expect(response.body.data.issueDetails.series.title).toBe('Spider-Man');
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
          lastEdited(filter: { us: true }, first: 2, order: "createdat", direction: "ASC") {
            edges {
              node {
                number
                variant
                createdat
                updatedat
                series { title }
                stories { number }
                cover { id }
              }
            }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(Array.isArray(response.body.data.lastEdited.edges)).toBe(true);
    expect(response.body.data.lastEdited.edges.length).toBeGreaterThan(0);
    expect(response.body.data.lastEdited.edges[0].node.series.title).toBe('Spider-Man');
  });

  it('returns variants for an issue', async () => {
    const query = {
      query: `
        query {
          lastEdited(first: 1) {
            edges {
              node {
                number
                variants {
                  variant
                }
              }
            }
          }
        }
      `,
    };

    const response = await request(url).post('/').send(query);

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.lastEdited.edges.length).toBe(1);
    expect(Array.isArray(response.body.data.lastEdited.edges[0].node.variants)).toBe(true);
  });
});
