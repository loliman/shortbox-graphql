import { GraphQLError } from 'graphql';
import { Op } from 'sequelize';
import { LoginRateLimitError } from '../src/services/UserService';

const mockIssueCsrfToken = jest.fn();

jest.mock('../src/core/csrf', () => ({
  issueCsrfToken: (...args: unknown[]) => mockIssueCsrfToken(...args),
}));

jest.mock('../src/core/cookies', () => ({
  resolveCookieSecurity: jest.fn(() => ({ secure: false, domain: undefined })),
  SESSION_COOKIE_NAME: 'sid',
  sessionCookieSameSite: 'lax',
}));

jest.mock('../src/types/schemas', () => ({
  LoginInputSchema: { parse: jest.fn((value) => value) },
  PublisherInputSchema: { parse: jest.fn((value) => value) },
  SeriesInputSchema: { parse: jest.fn((value) => value) },
  IssueInputSchema: { parse: jest.fn((value) => value) },
}));

import { LoginInputSchema, PublisherInputSchema, SeriesInputSchema, IssueInputSchema } from '../src/types/schemas';
import { resolvers as userResolvers } from '../src/modules/user/User.resolver';
import { resolvers as publisherResolvers } from '../src/modules/publisher/Publisher.resolver';
import { resolvers as seriesResolvers } from '../src/modules/series/Series.resolver';
import { resolvers as issueResolvers } from '../src/modules/issue/Issue.resolver';
import { resolvers as arcResolvers } from '../src/modules/arc/Arc.resolver';
import { resolvers as individualResolvers } from '../src/modules/individual/Individual.resolver';
import { resolvers as appearanceResolvers } from '../src/modules/appearance/Appearance.resolver';
import { resolvers as storyResolvers } from '../src/modules/story/Story.resolver';
import { resolvers as coverResolvers } from '../src/modules/cover/Cover.resolver';
import { resolvers as featureResolvers } from '../src/modules/feature/Feature.resolver';

const zodError = () => {
  const e = new Error('invalid');
  (e as Error & { name: string }).name = 'ZodError';
  return e;
};

const createRequest = () =>
  ({
    session: {
      userId: undefined as number | undefined,
      regenerate: (cb: (error?: Error | null) => void) => cb(null),
      save: (cb: (error?: Error | null) => void) => cb(null),
      destroy: (cb: (error?: Error | null) => void) => cb(null),
    },
  }) as any;

describe('User resolver additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('covers me/login/logout and User.id branches', async () => {
    const request = createRequest();
    const response = {
      setHeader: jest.fn(),
      clearCookie: jest.fn(),
    } as any;
    const models = {
      User: { findByPk: jest.fn().mockResolvedValue({ id: 5 }) },
      sequelize: { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) },
    } as any;
    const userService = {
      login: jest.fn().mockResolvedValue({ id: 7 }),
      logout: jest.fn().mockResolvedValue(true),
    } as any;

    await expect(
      userResolvers.Query.me({}, {}, { loggedIn: false, authenticatedUserId: undefined, models } as any),
    ).resolves.toBeNull();
    await expect(
      userResolvers.Query.me({}, {}, { loggedIn: true, authenticatedUserId: 5, models } as any),
    ).resolves.toEqual({ id: 5 });

    await expect(
      userResolvers.Mutation.login(
        {},
        { credentials: { name: 'alice', password: 'x' } } as any,
        { loggedIn: true } as any,
      ),
    ).rejects.toBeInstanceOf(GraphQLError);

    await expect(
      userResolvers.Mutation.login(
        {},
        { credentials: { name: 'alice', password: 'x' } } as any,
        {
          loggedIn: false,
          models,
          userService,
          response,
          requestIp: '1.2.3.4',
          request: undefined,
        } as any,
      ),
    ).rejects.toThrow('Request-Kontext fehlt');

    userService.login.mockResolvedValueOnce(null);
    await expect(
      userResolvers.Mutation.login(
        {},
        { credentials: { name: 'alice', password: 'x' } } as any,
        {
          loggedIn: false,
          models,
          userService,
          response,
          requestIp: '1.2.3.4',
          request,
        } as any,
      ),
    ).rejects.toThrow('Login fehlgeschlagen');

    userService.login.mockRejectedValueOnce(new LoginRateLimitError(4));
    await expect(
      userResolvers.Mutation.login(
        {},
        { credentials: { name: 'alice', password: 'x' } } as any,
        {
          loggedIn: false,
          models,
          userService,
          response,
          requestIp: '1.2.3.4',
          request,
        } as any,
      ),
    ).rejects.toThrow('Zu viele Login-Versuche');
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '4');

    (LoginInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      userResolvers.Mutation.login(
        {},
        { credentials: { name: '', password: '' } } as any,
        {
          loggedIn: false,
          models,
          userService,
          response,
          requestIp: '1.2.3.4',
          request,
        } as any,
      ),
    ).rejects.toThrow('invalid');

    userService.login.mockResolvedValueOnce({ id: 9 });
    const loginResult = await userResolvers.Mutation.login(
      {},
      { credentials: { name: 'alice', password: 'x' } } as any,
      {
        loggedIn: false,
        models,
        userService,
        response,
        requestIp: '1.2.3.4',
        request,
      } as any,
    );
    expect(loginResult).toEqual({ id: 9 });
    expect(request.session.userId).toBe(9);
    expect(mockIssueCsrfToken).toHaveBeenCalled();

    await expect(
      userResolvers.Mutation.logout({}, {}, { loggedIn: false } as any),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      userResolvers.Mutation.logout(
        {},
        {},
        { loggedIn: true, authenticatedUserId: undefined, models, userService, request, response } as any,
      ),
    ).rejects.toThrow('Ungültige Session');

    const logoutResult = await userResolvers.Mutation.logout(
      {},
      {},
      { loggedIn: true, authenticatedUserId: 9, models, userService, request, response } as any,
    );
    expect(logoutResult).toBe(true);
    expect(response.clearCookie).toHaveBeenCalledTimes(2);

    expect(userResolvers.User.id({ id: 42 } as any, {} as any, {} as any, {} as any)).toBe('42');
  });
});

describe('Publisher/Series/Issue resolver additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('covers publisher resolver query/mutation/fields', async () => {
    const models = {
      sequelize: { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) },
      Publisher: { findOne: jest.fn().mockResolvedValue({ id: 1 }) },
      Series: { count: jest.fn().mockResolvedValue(3) },
      Issue: {
        findAll: jest.fn().mockResolvedValue([{}, {}]),
        findOne: jest.fn().mockResolvedValue({ id: 1 }),
      },
    } as any;
    const publisherService = {
      findPublishers: jest.fn().mockResolvedValue([]),
      deletePublisher: jest.fn().mockResolvedValue(undefined),
      createPublisher: jest.fn().mockResolvedValue({ id: 11 }),
      editPublisher: jest.fn().mockResolvedValue({ id: 12 }),
    } as any;

    await publisherResolvers.Query.publishers(
      {},
      { pattern: '', us: true, first: 10, after: '', filter: null } as any,
      { loggedIn: true, publisherService } as any,
    );
    expect(publisherService.findPublishers).toHaveBeenCalled();

    await publisherResolvers.Query.publisher(
      {},
      { publisher: { name: 'Marvel' } } as any,
      { models } as any,
    );
    expect(PublisherInputSchema.parse).toHaveBeenCalled();

    await expect(
      publisherResolvers.Mutation.deletePublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: false, models, publisherService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      publisherResolvers.Mutation.deletePublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).resolves.toBe(true);
    expect(publisherService.deletePublisher).toHaveBeenCalled();

    await expect(
      publisherResolvers.Mutation.createPublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: false, models, publisherService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await publisherResolvers.Mutation.createPublisher(
      {},
      { item: { name: 'Marvel' } } as any,
      { loggedIn: true, models, publisherService } as any,
    );
    expect(publisherService.createPublisher).toHaveBeenCalled();

    (PublisherInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      publisherResolvers.Mutation.editPublisher(
        {},
        { old: { name: 'A' }, item: { name: 'B' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).rejects.toThrow('invalid');
    await publisherResolvers.Mutation.editPublisher(
      {},
      { old: { name: 'A' }, item: { name: 'B' } } as any,
      { loggedIn: true, models, publisherService } as any,
    );
    expect(publisherService.editPublisher).toHaveBeenCalled();

    (PublisherInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      publisherResolvers.Mutation.createPublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).rejects.toThrow('invalid');

    (PublisherInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      publisherResolvers.Mutation.deletePublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).rejects.toThrow('invalid');

    await expect(
      publisherResolvers.Mutation.editPublisher(
        {},
        { old: { name: 'A' }, item: { name: 'B' } } as any,
        { loggedIn: false, models, publisherService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    (PublisherInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom-delete');
    });
    await expect(
      publisherResolvers.Mutation.deletePublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).rejects.toThrow('boom-delete');

    (PublisherInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom-create');
    });
    await expect(
      publisherResolvers.Mutation.createPublisher(
        {},
        { item: { name: 'Marvel' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).rejects.toThrow('boom-create');

    (PublisherInputSchema.parse as jest.Mock)
      .mockImplementationOnce(() => ({ name: 'A' }))
      .mockImplementationOnce(() => {
        throw new Error('boom-edit');
      });
    await expect(
      publisherResolvers.Mutation.editPublisher(
        {},
        { old: { name: 'A' }, item: { name: 'B' } } as any,
        { loggedIn: true, models, publisherService } as any,
      ),
    ).rejects.toThrow('boom-edit');

    const parent = { id: 99, original: true, endyear: 0 };
    const anonId = publisherResolvers.Publisher.id(parent as any, {} as any, { loggedIn: false } as any);
    expect(typeof anonId).toBe('string');
    expect(publisherResolvers.Publisher.id(parent as any, {} as any, { loggedIn: true } as any)).toBe(
      '99',
    );
    expect(publisherResolvers.Publisher.us(parent as any, {} as any, {} as any, {} as any)).toBe(true);
    await expect(
      publisherResolvers.Publisher.seriesCount(parent as any, {} as any, { models } as any),
    ).resolves.toBe(3);
    await expect(
      publisherResolvers.Publisher.issueCount(parent as any, {} as any, { models } as any),
    ).resolves.toBe(2);
    await expect(
      publisherResolvers.Publisher.lastEdited(parent as any, { limit: 5 } as any, { models } as any),
    ).resolves.toEqual([{}, {}]);
    await expect(
      publisherResolvers.Publisher.firstIssue(parent as any, {} as any, { models } as any),
    ).resolves.toEqual({ id: 1 });
    await expect(
      publisherResolvers.Publisher.lastIssue(parent as any, {} as any, { models } as any),
    ).resolves.toEqual({ id: 1 });
    expect(publisherResolvers.Publisher.active(parent as any, {} as any, {} as any, {} as any)).toBe(
      true,
    );
  });

  it('covers series resolver query/mutation/fields', async () => {
    const models = {
      sequelize: { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) },
      Series: { findOne: jest.fn().mockResolvedValue({ id: 1 }) },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue([{ count: 1 }]),
        findOne: jest.fn().mockResolvedValue({ id: 10 }),
        findAll: jest.fn().mockResolvedValue([{ id: 20 }]),
      },
    } as any;
    const seriesService = {
      findSeries: jest.fn().mockResolvedValue([]),
      deleteSeries: jest.fn().mockResolvedValue(undefined),
      createSeries: jest.fn().mockResolvedValue({ id: 2 }),
      editSeries: jest.fn().mockResolvedValue({ id: 3 }),
    } as any;
    const publisherLoader = { load: jest.fn().mockResolvedValue({ id: 7 }) };

    await seriesResolvers.Query.series(
      {},
      { pattern: '', publisher: { name: 'Marvel' }, first: 10, after: '', filter: null } as any,
      { loggedIn: true, seriesService } as any,
    );
    await seriesResolvers.Query.seriesd(
      {},
      { series: { title: 'SM', volume: 1, publisher: { name: 'Marvel' } } } as any,
      { models } as any,
    );
    expect(SeriesInputSchema.parse).toHaveBeenCalled();

    await expect(
      seriesResolvers.Mutation.createSeries(
        {},
        { item: {} } as any,
        { loggedIn: false, models, seriesService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      seriesResolvers.Mutation.deleteSeries(
        {},
        { item: {} } as any,
        { loggedIn: false, models, seriesService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      seriesResolvers.Mutation.deleteSeries(
        {},
        { item: { title: 'SM' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).resolves.toBe(true);
    expect(seriesService.deleteSeries).toHaveBeenCalled();

    await seriesResolvers.Mutation.createSeries(
      {},
      { item: { title: 'SM' } } as any,
      { loggedIn: true, models, seriesService } as any,
    );
    expect(seriesService.createSeries).toHaveBeenCalled();

    await expect(
      seriesResolvers.Mutation.editSeries(
        {},
        { old: { title: 'A' }, item: { title: 'B' } } as any,
        { loggedIn: false, models, seriesService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await seriesResolvers.Mutation.editSeries(
      {},
      { old: { title: 'A' }, item: { title: 'B' } } as any,
      { loggedIn: true, models, seriesService } as any,
    );
    expect(seriesService.editSeries).toHaveBeenCalled();

    (SeriesInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      seriesResolvers.Mutation.deleteSeries(
        {},
        { item: { title: 'SM' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).rejects.toThrow('invalid');

    (SeriesInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      seriesResolvers.Mutation.createSeries(
        {},
        { item: { title: 'SM' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).rejects.toThrow('invalid');

    (SeriesInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      seriesResolvers.Mutation.editSeries(
        {},
        { old: { title: 'A' }, item: { title: 'B' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).rejects.toThrow('invalid');

    (SeriesInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom-delete');
    });
    await expect(
      seriesResolvers.Mutation.deleteSeries(
        {},
        { item: { title: 'SM' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).rejects.toThrow('boom-delete');

    (SeriesInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom-create');
    });
    await expect(
      seriesResolvers.Mutation.createSeries(
        {},
        { item: { title: 'SM' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).rejects.toThrow('boom-create');

    (SeriesInputSchema.parse as jest.Mock)
      .mockImplementationOnce(() => ({ title: 'A' }))
      .mockImplementationOnce(() => {
        throw new Error('boom-edit');
      });
    await expect(
      seriesResolvers.Mutation.editSeries(
        {},
        { old: { title: 'A' }, item: { title: 'B' } } as any,
        { loggedIn: true, models, seriesService } as any,
      ),
    ).rejects.toThrow('boom-edit');

    const parent = { id: 4, fk_publisher: 9, endyear: null };
    await expect(
      seriesResolvers.Series.publisher(parent as any, {} as any, { publisherLoader } as any),
    ).resolves.toEqual({ id: 7 });
    await expect(
      seriesResolvers.Series.publisher(
        { ...parent, Publisher: { id: 99 } } as any,
        {} as any,
        { publisherLoader } as any,
      ),
    ).resolves.toEqual({ id: 99 });
    await expect(
      seriesResolvers.Series.issueCount(parent as any, {} as any, { models } as any),
    ).resolves.toBe(1);
    models.Issue.count.mockResolvedValueOnce(5);
    await expect(
      seriesResolvers.Series.issueCount(parent as any, {} as any, { models } as any),
    ).resolves.toBe(5);
    await expect(
      seriesResolvers.Series.firstIssue(parent as any, {} as any, { models } as any),
    ).resolves.toEqual({ id: 10 });
    await expect(
      seriesResolvers.Series.lastIssue(parent as any, {} as any, { models } as any),
    ).resolves.toEqual({ id: 10 });
    await expect(
      seriesResolvers.Series.lastEdited(parent as any, { limit: 3 } as any, { models } as any),
    ).resolves.toEqual([{ id: 20 }]);
    expect(seriesResolvers.Series.active(parent as any, {} as any, {} as any, {} as any)).toBe(
      true,
    );
  });

  it('covers issue resolver query/mutation/fields', async () => {
    const models = {
      sequelize: { transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) },
      Issue: { findOne: jest.fn().mockResolvedValue({ id: 1 }) },
      Series: {},
      Publisher: {},
    } as any;
    const issueService = {
      findIssues: jest.fn().mockResolvedValue([]),
      getLastEdited: jest.fn().mockResolvedValue([]),
      deleteIssue: jest.fn().mockResolvedValue(undefined),
      createIssue: jest.fn().mockResolvedValue({ id: 2 }),
      editIssue: jest.fn().mockResolvedValue({ id: 3 }),
    } as any;

    await issueResolvers.Query.issues(
      {},
      { pattern: '', series: { title: 'SM', volume: 1, publisher: { name: 'Marvel' } } } as any,
      { loggedIn: true, issueService } as any,
    );
    await issueResolvers.Query.issue(
      {},
      { issue: { number: '1', variant: '', series: { title: 'SM', volume: 1, publisher: { name: 'Marvel' } } } } as any,
      { models } as any,
    );
    expect(IssueInputSchema.parse).toHaveBeenCalled();
    await issueResolvers.Query.lastEdited(
      {},
      { filter: null, first: 10, after: '', order: 'updatedAt', direction: 'DESC' } as any,
      { issueService, loggedIn: true } as any,
    );

    await expect(
      issueResolvers.Mutation.createIssue(
        {},
        { item: {} } as any,
        { loggedIn: false, models, issueService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      issueResolvers.Mutation.deleteIssue(
        {},
        { item: {} } as any,
        { loggedIn: false, models, issueService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      issueResolvers.Mutation.editIssue(
        {},
        { old: {}, item: {} } as any,
        { loggedIn: false, models, issueService } as any,
      ),
    ).rejects.toThrow('Du bist nicht eingeloggt');

    await expect(
      issueResolvers.Mutation.deleteIssue(
        {},
        { item: { number: '1' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).resolves.toBe(true);
    expect(issueService.deleteIssue).toHaveBeenCalled();

    await issueResolvers.Mutation.createIssue(
      {},
      { item: { number: '1' } } as any,
      { loggedIn: true, models, issueService } as any,
    );
    expect(issueService.createIssue).toHaveBeenCalled();

    await issueResolvers.Mutation.editIssue(
      {},
      { old: { number: '1' }, item: { number: '2' } } as any,
      { loggedIn: true, models, issueService } as any,
    );
    expect(issueService.editIssue).toHaveBeenCalled();

    (IssueInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      issueResolvers.Mutation.deleteIssue(
        {},
        { item: { number: '1' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).rejects.toThrow('invalid');

    (IssueInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      issueResolvers.Mutation.createIssue(
        {},
        { item: { number: '1' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).rejects.toThrow('invalid');

    (IssueInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom-delete');
    });
    await expect(
      issueResolvers.Mutation.deleteIssue(
        {},
        { item: { number: '1' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).rejects.toThrow('boom-delete');

    (IssueInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom-create');
    });
    await expect(
      issueResolvers.Mutation.createIssue(
        {},
        { item: { number: '1' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).rejects.toThrow('boom-create');

    (IssueInputSchema.parse as jest.Mock)
      .mockImplementationOnce(() => ({ number: '1' }))
      .mockImplementationOnce(() => {
        throw new Error('boom-edit');
      });
    await expect(
      issueResolvers.Mutation.editIssue(
        {},
        { old: { number: '1' }, item: { number: '2' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).rejects.toThrow('boom-edit');

    (IssueInputSchema.parse as jest.Mock).mockImplementationOnce(() => {
      throw zodError();
    });
    await expect(
      issueResolvers.Mutation.editIssue(
        {},
        { old: { number: '1' }, item: { number: '2' } } as any,
        { loggedIn: true, models, issueService } as any,
      ),
    ).rejects.toThrow('invalid');

    const seriesLoader = { load: jest.fn().mockResolvedValue({ id: 8 }) };
    const issueStoriesLoader = { load: jest.fn().mockResolvedValue([{ id: 81 }]) };
    const issueCoverLoader = { load: jest.fn().mockResolvedValue({ id: 82 }) };
    const issueCoversLoader = { load: jest.fn().mockResolvedValue([{ id: 83 }]) };
    const issueFeaturesLoader = { load: jest.fn().mockResolvedValue([{ id: 84 }]) };
    const issueVariantsLoader = { load: jest.fn().mockResolvedValue([{ id: 85 }]) };
    const parent = { id: 4, fk_series: 8, number: '1' } as any;

    await expect(
      issueResolvers.Issue.series(parent, {} as any, { seriesLoader } as any),
    ).resolves.toEqual({ id: 8 });
    await expect(
      issueResolvers.Issue.series({ ...parent, Series: { id: 99 } } as any, {} as any, { seriesLoader } as any),
    ).resolves.toEqual({ id: 99 });
    await expect(
      issueResolvers.Issue.stories(parent, {} as any, { issueStoriesLoader } as any),
    ).resolves.toEqual([{ id: 81 }]);
    await expect(
      issueResolvers.Issue.cover(parent, {} as any, { issueCoverLoader } as any),
    ).resolves.toEqual({ id: 82 });
    await expect(
      issueResolvers.Issue.covers(parent, {} as any, { issueCoversLoader } as any),
    ).resolves.toEqual([{ id: 83 }]);
    await expect(
      issueResolvers.Issue.individuals({} as any, {} as any, {} as any),
    ).resolves.toEqual([]);
    await expect(
      issueResolvers.Issue.individuals({ getIndividuals: async () => ['x'] } as any, {} as any, {} as any),
    ).resolves.toEqual(['x']);
    await expect(issueResolvers.Issue.arcs({} as any, {} as any, {} as any)).resolves.toEqual([]);
    await expect(
      issueResolvers.Issue.arcs({ getArcs: async () => ['a'] } as any, {} as any, {} as any),
    ).resolves.toEqual(['a']);
    await expect(
      issueResolvers.Issue.features(parent, {} as any, { issueFeaturesLoader } as any),
    ).resolves.toEqual([{ id: 84 }]);
    await expect(
      issueResolvers.Issue.variants(parent, {} as any, { issueVariantsLoader } as any),
    ).resolves.toEqual([{ id: 85 }]);
  });
});

describe('Smaller resolvers additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('covers arc/individual/appearance resolvers', async () => {
    const models = {
      Arc: { findAll: jest.fn().mockResolvedValue([{ id: 1, title: ' Arc ' }]) },
      Issue: { findAll: jest.fn().mockResolvedValue([{ id: 2 }]) },
      Individual: { findAll: jest.fn().mockResolvedValue([{ id: 3, name: 'Peter' }]) },
      Story_Individual: { findAll: jest.fn().mockResolvedValue([{ type: 'WRITER' }]) },
      Cover_Individual: { findAll: jest.fn().mockResolvedValue([{ type: 'ARTIST' }]) },
      Issue_Individual: { findAll: jest.fn().mockResolvedValue([{ type: 'EDITOR' }]) },
      Feature_Individual: { findAll: jest.fn().mockResolvedValue([{ type: 'COLORIST' }]) },
      Appearance: { findAll: jest.fn().mockResolvedValue([{ id: 4, name: 'Spidey', type: '' }]) },
      Story_Appearance: { findOne: jest.fn().mockResolvedValue({ role: 'FEATURED' }) },
    } as any;

    const cursor = Buffer.from('5').toString('base64');
    await arcResolvers.Query.arcs(
      {},
      { pattern: 'arc one', type: 'event', first: 10, after: cursor } as any,
      { models } as any,
    );
    await arcResolvers.Query.arcs(
      {},
      { pattern: '', type: undefined, first: 5, after: undefined } as any,
      { models } as any,
    );
    const arcWhere = models.Arc.findAll.mock.calls[0][0].where;
    expect(arcWhere.type).toEqual({ [Op.eq]: 'EVENT' });
    expect(arcResolvers.Arc.id({ id: 9 } as any, {} as any, { loggedIn: false } as any)).toMatch(
      /^\d+$/,
    );
    expect(arcResolvers.Arc.title({ title: ' Arc ' } as any, {} as any, {} as any, {} as any)).toBe(
      'Arc',
    );
    await expect(arcResolvers.Arc.issues({ id: 1 } as any, {} as any, { models } as any)).resolves.toEqual([
      { id: 2 },
    ]);

    await individualResolvers.Query.individuals(
      {},
      { pattern: 'spider man', first: 10, after: cursor } as any,
      { models } as any,
    );
    expect(individualResolvers.Individual.id({ id: 1 } as any, {} as any, { loggedIn: false } as any)).toMatch(
      /^\d+$/,
    );
    expect(individualResolvers.Individual.name({ name: 'Peter' } as any, {} as any, {} as any, {} as any)).toBe(
      'Peter',
    );
    await expect(
      individualResolvers.Individual.type({ id: 7, Stories: [{ id: 10 }] } as any, {} as any, { models } as any),
    ).resolves.toEqual(['WRITER']);
    await expect(
      individualResolvers.Individual.type({ id: 7, Covers: [{ id: 10 }] } as any, {} as any, { models } as any),
    ).resolves.toEqual(['ARTIST']);
    await expect(
      individualResolvers.Individual.type({ id: 7, Issues: [{ id: 10 }] } as any, {} as any, { models } as any),
    ).resolves.toEqual(['EDITOR']);
    await expect(
      individualResolvers.Individual.type({ id: 7, Features: [{ id: 10 }] } as any, {} as any, { models } as any),
    ).resolves.toEqual(['COLORIST']);
    await expect(individualResolvers.Individual.type({ id: 7 } as any, {} as any, { models } as any)).resolves.toEqual(
      [],
    );

    await appearanceResolvers.Query.apps(
      {},
      { pattern: 'spi der', type: 'character', first: 10, after: cursor } as any,
      { models } as any,
    );
    expect(
      appearanceResolvers.Appearance.id({ id: 12 } as any, {} as any, { loggedIn: false } as any),
    ).toMatch(/^\d+$/);
    expect(
      appearanceResolvers.Appearance.name({ name: ' Spidey ' } as any, {} as any, {} as any, {} as any),
    ).toBe('Spidey');
    expect(appearanceResolvers.Appearance.type({ type: '' } as any, {} as any, {} as any, {} as any)).toBe(
      'CHARACTER',
    );
    expect(
      appearanceResolvers.Appearance.type({ type: 'GROUP' } as any, {} as any, {} as any, {} as any),
    ).toBe('GROUP');
    await expect(
      appearanceResolvers.Appearance.role({ id: 4 } as any, {} as any, { models } as any),
    ).resolves.toBe('');
    await expect(
      appearanceResolvers.Appearance.role({ id: 4, Stories: [{ id: 99 }] } as any, {} as any, { models } as any),
    ).resolves.toBe('FEATURED');
  });

  it('covers story/cover/feature field resolvers', async () => {
    const models = {
      Cover: {
        findByPk: jest.fn().mockResolvedValue({ id: 1 }),
        findAll: jest.fn().mockResolvedValue([{ id: 2 }]),
      },
    } as any;
    const storyLoader = { load: jest.fn().mockResolvedValue({ id: 3 }) };
    const storyChildrenLoader = { load: jest.fn().mockResolvedValue([{ id: 4 }]) };
    const storyReprintsLoader = { load: jest.fn().mockResolvedValue([{ id: 5 }]) };
    const issueLoader = { load: jest.fn().mockResolvedValue({ id: 6, Series: { Publisher: { original: true } } }) };

    expect(storyResolvers.Story.id({ id: 8 } as any, {} as any, { loggedIn: false } as any)).toMatch(
      /^\d+$/,
    );
    await expect(
      storyResolvers.Story.parent({ fk_parent: 2 } as any, {} as any, { storyLoader } as any),
    ).resolves.toEqual({ id: 3 });
    await expect(
      storyResolvers.Story.parent({ fk_parent: null } as any, {} as any, { storyLoader } as any),
    ).resolves.toBeNull();
    await expect(
      storyResolvers.Story.children({ id: 2 } as any, {} as any, { storyChildrenLoader } as any),
    ).resolves.toEqual([{ id: 4 }]);
    await expect(
      storyResolvers.Story.reprintOf({ fk_reprint: 2 } as any, {} as any, { storyLoader } as any),
    ).resolves.toEqual({ id: 3 });
    await expect(
      storyResolvers.Story.reprints({ id: 2 } as any, {} as any, { storyReprintsLoader } as any),
    ).resolves.toEqual([{ id: 5 }]);
    await expect(
      storyResolvers.Story.issue({ fk_issue: 9 } as any, {} as any, { issueLoader } as any),
    ).resolves.toEqual({ id: 6, Series: { Publisher: { original: true } } });
    await expect(storyResolvers.Story.individuals({} as any, {} as any, {} as any)).resolves.toEqual([]);
    await expect(
      storyResolvers.Story.individuals({ getIndividuals: async () => ['a'] } as any, {} as any, {} as any),
    ).resolves.toEqual(['a']);
    await expect(storyResolvers.Story.appearances({} as any, {} as any, {} as any)).resolves.toEqual([]);
    await expect(
      storyResolvers.Story.appearances({ getAppearances: async () => ['x'] } as any, {} as any, {} as any),
    ).resolves.toEqual(['x']);
    expect(storyResolvers.Story.exclusive({ onlyapp: true, firstapp: true } as any, {} as any, {} as any, {} as any)).toBe(
      true,
    );
    expect(
      storyResolvers.Story.exclusive({ onlyapp: true, firstapp: false } as any, {} as any, {} as any, {} as any),
    ).toBe(false);

    expect(coverResolvers.Cover.id({ id: 1 } as any, {} as any, { loggedIn: false } as any)).toMatch(
      /^\d+$/,
    );
    await expect(
      coverResolvers.Cover.parent({ fk_parent: 10 } as any, {} as any, { models } as any),
    ).resolves.toEqual({ id: 1 });
    await expect(
      coverResolvers.Cover.parent({ fk_parent: null } as any, {} as any, { models } as any),
    ).resolves.toBeNull();
    await expect(
      coverResolvers.Cover.children({ id: 4 } as any, {} as any, { models } as any),
    ).resolves.toEqual([{ id: 2 }]);
    await expect(
      coverResolvers.Cover.issue({ fk_issue: 1 } as any, {} as any, { issueLoader } as any),
    ).resolves.toEqual({ id: 6, Series: { Publisher: { original: true } } });
    await expect(coverResolvers.Cover.individuals({} as any, {} as any, {} as any)).resolves.toEqual([]);
    await expect(
      coverResolvers.Cover.individuals({ getIndividuals: async () => ['i'] } as any, {} as any, {} as any),
    ).resolves.toEqual(['i']);
    await expect(
      coverResolvers.Cover.onlyapp({ fk_issue: 1 } as any, {} as any, { models, issueLoader } as any),
    ).resolves.toBe(true);
    await expect(
      coverResolvers.Cover.onlyapp(
        { fk_issue: 1, Issue: { Series: { Publisher: { original: false } } } } as any,
        {} as any,
        { models, issueLoader } as any,
      ),
    ).resolves.toBe(false);
    expect(coverResolvers.Cover.exclusive({} as any, {} as any, {} as any, {} as any)).toBe(false);

    expect(featureResolvers.Feature.id({ id: 7 } as any, {} as any, { loggedIn: false } as any)).toMatch(
      /^\d+$/,
    );
    expect(featureResolvers.Feature.title({ title: ' Back-up ' } as any, {} as any, {} as any, {} as any)).toBe(
      'Back-up',
    );
    await expect(
      featureResolvers.Feature.issue({ fk_issue: 1 } as any, {} as any, { issueLoader } as any),
    ).resolves.toEqual({ id: 6, Series: { Publisher: { original: true } } });
    await expect(
      featureResolvers.Feature.issue(
        { fk_issue: 1, Issue: { id: 123 } } as any,
        {} as any,
        { issueLoader } as any,
      ),
    ).resolves.toEqual({ id: 123 });
    await expect(featureResolvers.Feature.individuals({} as any, {} as any, {} as any)).resolves.toEqual(
      [],
    );
    await expect(
      featureResolvers.Feature.individuals({ getIndividuals: async () => ['p'] } as any, {} as any, {} as any),
    ).resolves.toEqual(['p']);
  });
});
