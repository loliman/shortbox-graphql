import {
  createConnection,
  getIssueFixture,
  getNodes,
  getPublisherFixture,
  getSeriesFixture,
  matches,
  mockApps,
  mockArcs,
  mockIndividuals,
  mockIssuesList,
  mockLastEdited,
  mockPublishers,
  mockSeriesList,
} from './data';

export const mockResolvers = {
  Query: {
    me: () => ({ id: 1 }),
    nodes: (_: unknown, args: { pattern?: string }) => getNodes(args.pattern),
    export: () => 'Mock export content',
    publisherList: (_: unknown, args: { pattern?: string }) =>
      createConnection(mockPublishers.filter((p) => matches(p.name, args.pattern))),
    publisherDetails: (_: unknown, args: { publisher?: { us?: boolean } }) => {
      const us = typeof args.publisher?.us === 'boolean' ? args.publisher.us : false;
      return getPublisherFixture(us);
    },
    seriesList: (_: unknown, args: { pattern?: string; publisher?: { name?: string } }) =>
      createConnection(
        mockSeriesList.filter(
          (s) => matches(s.title, args.pattern) && matches(s.publisher.name, args.publisher?.name),
        ),
      ),
    seriesDetails: (_: unknown, args: { series?: { publisher?: { us?: boolean } } }) => {
      const us = typeof args.series?.publisher?.us === 'boolean' ? args.series.publisher.us : false;
      return getSeriesFixture(us);
    },
    issueList: (_: unknown, args: { pattern?: string }) =>
      createConnection(
        mockIssuesList.filter((i) => matches(String(i.title || i.number), args.pattern)),
      ),
    issueDetails: (
      _: unknown,
      args: {
        issue?: { series?: { publisher?: { us?: boolean } } };
        us?: boolean;
      },
    ) => {
      const us = Boolean(args.us ?? args.issue?.series?.publisher?.us);
      return getIssueFixture(us);
    },
    lastEdited: () => createConnection(mockLastEdited),
    arcs: (_: unknown, args: { pattern?: string }) =>
      createConnection(mockArcs.filter((a) => matches(a.title, args.pattern))),
    individuals: (_: unknown, args: { pattern?: string }) =>
      createConnection(mockIndividuals.filter((i) => matches(i.name, args.pattern))),
    apps: (_: unknown, args: { pattern?: string }) =>
      createConnection(mockApps.filter((a) => matches(a.name, args.pattern))),
  },
  Mutation: {
    login: () => ({ id: 1 }),
    logout: () => true,
    deletePublisher: () => true,
    deleteSeries: () => true,
    deleteIssue: () => true,
    createPublisher: (_: unknown, args: { item: Record<string, unknown> }) => ({
      id: 'pub-created',
      us: true,
      ...args.item,
    }),
    editPublisher: (_: unknown, args: { item: Record<string, unknown> }) => ({
      id: 'pub-edited',
      us: true,
      ...args.item,
    }),
    createSeries: (_: unknown, args: { item: Record<string, unknown> }) => ({
      id: 'series-created',
      publisher: getPublisherFixture(false),
      ...args.item,
    }),
    editSeries: (_: unknown, args: { item: Record<string, unknown> }) => ({
      id: 'series-edited',
      publisher: getPublisherFixture(false),
      ...args.item,
    }),
    createIssue: (_: unknown, args: { item: Record<string, unknown> }) => ({
      id: 'issue-created',
      ...getIssueFixture(false),
      ...args.item,
    }),
    editIssue: (_: unknown, args: { item: Record<string, unknown> }) => ({
      id: 'issue-edited',
      ...getIssueFixture(false),
      ...args.item,
    }),
  },
  Publisher: {
    seriesCount: (parent: { seriesCount?: number }) => parent.seriesCount ?? 0,
    issueCount: (parent: { issueCount?: number }) => parent.issueCount ?? 0,
    lastEdited: () => mockLastEdited,
    active: (parent: { active?: boolean }) => parent.active ?? true,
  },
  Series: {
    issueCount: (parent: { issueCount?: number }) => parent.issueCount ?? 0,
    lastEdited: () => mockLastEdited,
    active: (parent: { active?: boolean }) => parent.active ?? true,
  },
  Issue: {
    updatedAt: (parent: { updatedAt?: string; updatedat?: string }) =>
      parent.updatedAt ?? parent.updatedat ?? null,
  },
};
