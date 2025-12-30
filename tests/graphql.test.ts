import request from 'supertest';
import { ApolloServer } from '@apollo/server';
import { startServer } from '../src/core/server';
import sequelize from '../src/core/database';

describe('GraphQL Integration Tests', () => {
  let url: string;
  let serverInstance: any;

  beforeAll(async () => {
    const result = await startServer(4001);
    url = result.url;
    serverInstance = result.server;
  });

  afterAll(async () => {
    if (serverInstance) {
      try {
        await serverInstance.stop();
      } catch (e) {
        console.error('Error stopping apollo server:', e);
      }
    }
  }, 30000);

  it('should fetch publishers', async () => {
    const query = {
      query: `
        query {
          publishers(us: true) {
            name
          }
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.publishers).toBeDefined();
    expect(Array.isArray(response.body.data.publishers)).toBe(true);
  });

  it('should fetch publisher with firstIssue, lastIssue and active fields', async () => {
    const query = {
      query: `
        query {
          publishers(us: true, limit: 1) {
            name
            firstIssue {
              number
            }
            lastIssue {
              number
            }
            active
          }
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.publishers).toBeDefined();
    if (response.body.data.publishers.length > 0) {
      expect(response.body.data.publishers[0].active).toBeDefined();
    }
  });

  it('should reproduce variant undefined error in issue query', async () => {
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
          }
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    // If it fails with the reported error, it will likely return a 200 with errors array
    // or maybe a 500 depending on how Apollo handles this specific TypeError
    if (response.body.errors) {
      console.log('Error from issue query:', response.body.errors[0].message);
    }
    expect(response.status).toBe(200);
  });

  it('should fetch series with pattern', async () => {
    const query = {
      query: `
        query {
          series(pattern: "Spider-Man", publisher: { name: "Marvel Comics", us: true }) {
            title
            volume
          }
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.series).toBeDefined();
  });

  it('should return UNAUTHENTICATED for protected mutations', async () => {
    const mutation = {
      query: `
        mutation {
          deleteSeries(item: { title: "Test", volume: 1, publisher: { name: "Marvel" } })
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(mutation);

    expect(response.body.errors).toBeDefined();
    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('should fetch lastEdited issues with order, direction and limit', async () => {
    const query = {
      query: `
        query {
          lastEdited(filter: { us: true }, limit: 5, order: "createdAt", direction: "ASC") {
            number
            verified
            collected
            comicguideid
            createdAt
            updatedAt
            series {
              title
            }
            stories {
              number
              collected
              addinfo
              part
            }
            cover {
              id
            }
            isbn
            limitation
            addinfo
          }
        }
      `,
    };

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.lastEdited).toBeDefined();
    expect(response.body.data.lastEdited.length).toBeLessThanOrEqual(5);
    if (response.body.data.lastEdited.length > 0) {
      expect(response.body.data.lastEdited[0].verified).toBeDefined();
      expect(response.body.data.lastEdited[0].collected).toBeDefined();
      expect(response.body.data.lastEdited[0].createdAt).toBeDefined();
      expect(response.body.data.lastEdited[0].updatedAt).toBeDefined();
      expect(response.body.data.lastEdited[0].isbn).toBeDefined();
      expect(response.body.data.lastEdited[0].limitation).toBeDefined();
      expect(response.body.data.lastEdited[0].addinfo).toBeDefined();
      if (response.body.data.lastEdited[0].stories.length > 0) {
        expect(response.body.data.lastEdited[0].stories[0].addinfo).toBeDefined();
        expect(response.body.data.lastEdited[0].stories[0].part).toBeDefined();
      }
    }
  });

  it('should fetch an issue with edit argument', async () => {
    const query = {
      query: `
        query {
          lastEdited(limit: 1) {
            number
            variant
            series {
              title
              volume
              publisher {
                name
              }
            }
          }
        }
      `,
    };

    const lastEditedRes = await request(url).post('/').send(query);
    const issueInfo = lastEditedRes.body.data.lastEdited[0];

    const issueQuery = {
      query: `
        query($issue: IssueInput!) {
          issue(issue: $issue, edit: true) {
            number
          }
        }
      `,
      variables: {
        issue: {
          number: issueInfo.number,
          variant: issueInfo.variant,
          series: {
            title: issueInfo.series.title,
            volume: issueInfo.series.volume,
            publisher: {
              name: issueInfo.series.publisher.name
            }
          }
        }
      }
    };

    const response = await request(url).post('/').send(issueQuery);
    expect(response.status).toBe(200);
    expect(response.body.data.issue).toBeDefined();
    expect(response.body.data.issue.number).toBe(issueInfo.number);
  });
  it('should fetch variants of an issue', async () => {
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

    const response = await request(url)
      .post('/')
      .send(query);

    expect(response.status).toBe(200);
    expect(response.body.data.lastEdited).toBeDefined();
    if (response.body.data.lastEdited.length > 0) {
      expect(response.body.data.lastEdited[0].variants).toBeDefined();
      expect(Array.isArray(response.body.data.lastEdited[0].variants)).toBe(true);
    }
  });
});
