import { updateStoryFilterFlagsForIssue } from '../src/util/FilterUpdater';

type MutableStory = {
  id: number;
  fk_parent: number | null;
  fk_reprint: number | null;
  part?: string | null;
  onlyapp: boolean;
  firstapp: boolean;
  otheronlytb: boolean;
  onlytb: boolean;
  onlyoneprint: boolean;
  issue?: { format?: string; releasedate?: string } | null;
  save: jest.Mock<Promise<unknown>, [unknown?]>;
};

const createStory = (seed: Partial<MutableStory> & Pick<MutableStory, 'id'>): MutableStory => ({
  id: seed.id,
  fk_parent: seed.fk_parent ?? null,
  fk_reprint: seed.fk_reprint ?? null,
  part: seed.part ?? null,
  onlyapp: seed.onlyapp ?? false,
  firstapp: seed.firstapp ?? false,
  otheronlytb: seed.otheronlytb ?? false,
  onlytb: seed.onlytb ?? false,
  onlyoneprint: seed.onlyoneprint ?? false,
  issue: seed.issue ?? null,
  save: jest.fn().mockResolvedValue(undefined),
});

const extractInValues = (value: unknown): number[] => {
  if (!value || typeof value !== 'object') return [];
  const inKey = Object.getOwnPropertySymbols(value).find((key) => String(key).includes('in'));
  if (!inKey) return [];
  const raw = (value as Record<symbol, unknown>)[inKey];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
};

const createStoryFindAllMock = (
  parents: MutableStory[],
  children: MutableStory[],
  issueStoriesByIssueId: Record<number, Array<Pick<MutableStory, 'id' | 'fk_parent'>>>,
) =>
  jest.fn().mockImplementation(({ where }) => {
    if (!where || typeof where !== 'object') return Promise.resolve([]);

    const fkIssueClause = (where as Record<string, unknown>).fk_issue;
    if (typeof fkIssueClause === 'number') {
      return Promise.resolve(issueStoriesByIssueId[fkIssueClause] || []);
    }

    const idClause = (where as Record<string, unknown>).id;
    if (idClause) {
      const ids = extractInValues(idClause);
      return Promise.resolve(parents.filter((story) => ids.includes(story.id)));
    }

    const fkParentClause = (where as Record<string, unknown>).fk_parent;
    if (fkParentClause) {
      const parentIds = extractInValues(fkParentClause);
      return Promise.resolve(
        children.filter((story) => story.fk_parent != null && parentIds.includes(story.fk_parent)),
      );
    }

    const fkReprintClause = (where as Record<string, unknown>).fk_reprint;
    if (fkReprintClause) {
      const reprintIds = extractInValues(fkReprintClause);
      return Promise.resolve(
        parents.filter((story) => story.fk_reprint != null && reprintIds.includes(story.fk_reprint)),
      );
    }

    return Promise.resolve([]);
  });

describe('FilterUpdater', () => {
  it('sets firstapp/onlyapp and otheronlytb for child stories and parent flags (DE issue input)', async () => {
    const parent = createStory({ id: 100, onlytb: true, onlyoneprint: true });
    const childHeft = createStory({
      id: 1,
      fk_parent: 100,
      issue: { format: 'Heft', releasedate: '2024-01-01' },
      onlytb: true,
    });
    const childTb = createStory({
      id: 2,
      fk_parent: 100,
      issue: { format: 'Taschenbuch', releasedate: '2025-01-01' },
      onlytb: true,
    });

    const models = {
      Story: {
        findAll: createStoryFindAllMock([parent], [childHeft, childTb], {
          9001: [{ id: 1, fk_parent: 100 }],
        }),
      },
      Issue: {
        findByPk: jest.fn().mockResolvedValue({ series: { publisher: { original: false } } }),
      },
      Series: {},
      Publisher: {},
    } as any;

    await updateStoryFilterFlagsForIssue(models, 9001, {} as any);

    expect(parent.onlytb).toBe(false);
    expect(parent.onlyoneprint).toBe(false);

    expect(childHeft.onlyapp).toBe(false);
    expect(childTb.onlyapp).toBe(false);
    expect(childHeft.firstapp).toBe(true);
    expect(childTb.firstapp).toBe(false);
    expect(childHeft.otheronlytb).toBe(true);
    expect(childTb.otheronlytb).toBe(false);
    expect(childHeft.onlytb).toBe(false);
    expect(childTb.onlytb).toBe(false);
  });

  it('marks single child as onlyapp and parent as onlytb/onlyoneprint when applicable', async () => {
    const parent = createStory({ id: 200 });
    const onlyChild = createStory({
      id: 3,
      fk_parent: 200,
      issue: { format: 'Taschenbuch', releasedate: '2024-01-01' },
    });

    const models = {
      Story: {
        findAll: createStoryFindAllMock([parent], [onlyChild], {
          9002: [{ id: 3, fk_parent: 200 }],
        }),
      },
      Issue: {
        findByPk: jest.fn().mockResolvedValue({ series: { publisher: { original: false } } }),
      },
      Series: {},
      Publisher: {},
    } as any;

    await updateStoryFilterFlagsForIssue(models, 9002, {} as any);

    expect(parent.onlytb).toBe(true);
    expect(parent.onlyoneprint).toBe(true);
    expect(onlyChild.onlyapp).toBe(true);
    expect(onlyChild.firstapp).toBe(true);
    expect(onlyChild.otheronlytb).toBe(false);
  });

  it('recalculates US parent stories when a US issue is passed in', async () => {
    const parentA = createStory({ id: 300, fk_reprint: 301 });
    const parentB = createStory({ id: 301, fk_reprint: 302 });
    const parentC = createStory({ id: 302, fk_reprint: null });

    const childOnA = createStory({
      id: 31,
      fk_parent: 300,
      issue: { format: 'Heft', releasedate: '2024-06-01' },
    });
    const childOnC = createStory({
      id: 32,
      fk_parent: 302,
      issue: { format: 'Taschenbuch', releasedate: '2023-06-01' },
    });

    const models = {
      Story: {
        findAll: createStoryFindAllMock([parentA, parentB, parentC], [childOnA, childOnC], {
          9003: [
            { id: 300, fk_parent: null },
            { id: 301, fk_parent: null },
            { id: 302, fk_parent: null },
          ],
        }),
      },
      Issue: {
        findByPk: jest.fn().mockResolvedValue({ series: { publisher: { original: true } } }),
      },
      Series: {},
      Publisher: {},
    } as any;

    await updateStoryFilterFlagsForIssue(models, 9003, {} as any);

    expect(parentA.onlyoneprint).toBe(false);
    expect(parentB.onlyoneprint).toBe(false);
    expect(parentC.onlyoneprint).toBe(false);

    expect(childOnC.firstapp).toBe(true);
    expect(childOnA.firstapp).toBe(false);
    expect(childOnA.otheronlytb).toBe(true);
    expect(childOnC.otheronlytb).toBe(false);
  });

  it('marks first partial and first complete publication separately via firstapp', async () => {
    const parent = createStory({ id: 400 });
    const firstPartial = createStory({
      id: 41,
      fk_parent: 400,
      part: '1/3',
      issue: { format: 'Heft', releasedate: '1965-01-01' },
    });
    const secondPartial = createStory({
      id: 42,
      fk_parent: 400,
      part: '2/3',
      issue: { format: 'Heft', releasedate: '1965-02-01' },
    });
    const firstComplete = createStory({
      id: 43,
      fk_parent: 400,
      issue: { format: 'Taschenbuch', releasedate: '1975-01-01' },
    });

    const models = {
      Story: {
        findAll: createStoryFindAllMock([parent], [firstPartial, secondPartial, firstComplete], {
          9004: [{ id: 41, fk_parent: 400 }],
        }),
      },
      Issue: {
        findByPk: jest.fn().mockResolvedValue({ series: { publisher: { original: false } } }),
      },
      Series: {},
      Publisher: {},
    } as any;

    await updateStoryFilterFlagsForIssue(models, 9004, {} as any);

    expect(firstPartial.firstapp).toBe(true);
    expect(secondPartial.firstapp).toBe(false);
    expect(firstComplete.firstapp).toBe(true);
  });
});
