import { Op, Transaction } from 'sequelize';
import type { DbModels } from '../types/db';
import type { Issue } from '../modules/issue/Issue.model';
import type { Story } from '../modules/story/Story.model';

type StoryWithIssue = Story & {
  issue?: Pick<Issue, 'format' | 'releasedate'> | null;
};

type StoryWithRelations = Story & {
  fk_reprint?: number | null;
  part?: string | null;
};

const toPositiveInt = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const intValue = Math.trunc(numeric);
  return intValue > 0 ? intValue : null;
};

const normalizeParentIds = (parentStoryIds: Iterable<number>): number[] =>
  Array.from(new Set(Array.from(parentStoryIds)))
    .map((entry) => toPositiveInt(entry))
    .filter((entry): entry is number => entry != null);

const toDateTimestamp = (value: unknown): number => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY;
};

const isPocketBookFormat = (format: unknown): boolean =>
  String(format || '')
    .trim()
    .toLowerCase() === 'taschenbuch';

const PART_PATTERN = /^(\d+)\s*\/\s*(\d+)$/;

const parseStoryPart = (value: unknown): { current: number; total: number } | null => {
  const match = String(value || '')
    .trim()
    .match(PART_PATTERN);
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || current <= 0 || total <= 0) {
    return null;
  }

  return { current, total };
};

const isPartialPublicationStart = (part: unknown): boolean => {
  const parsed = parseStoryPart(part);
  return Boolean(parsed && parsed.current === 1 && parsed.total > 1);
};

const isCompletePublication = (part: unknown): boolean => {
  const parsed = parseStoryPart(part);
  return !parsed || parsed.total <= 1;
};

const resolveRecursiveRelatedParentIds = async (
  models: DbModels,
  initialParentIds: number[],
  transaction?: Transaction,
): Promise<number[]> => {
  const discovered = new Set<number>(initialParentIds);
  let frontier = [...initialParentIds];

  while (frontier.length > 0) {
    const [rowsByIdRaw, rowsByReprintRaw] = await Promise.all([
      models.Story.findAll({
        where: { id: { [Op.in]: frontier } },
        attributes: ['id', 'fk_reprint'],
        transaction,
      }),
      models.Story.findAll({
        where: { fk_reprint: { [Op.in]: frontier } },
        attributes: ['id', 'fk_reprint'],
        transaction,
      }),
    ]);

    const rowsById = rowsByIdRaw as StoryWithRelations[];
    const rowsByReprint = rowsByReprintRaw as StoryWithRelations[];

    const nextFrontier = new Set<number>();
    for (const story of rowsById) {
      const fkReprint = toPositiveInt(story.fk_reprint);
      if (fkReprint != null && !discovered.has(fkReprint)) {
        discovered.add(fkReprint);
        nextFrontier.add(fkReprint);
      }
    }

    for (const story of rowsByReprint) {
      const storyId = toPositiveInt(story.id);
      if (storyId != null && !discovered.has(storyId)) {
        discovered.add(storyId);
        nextFrontier.add(storyId);
      }

      const fkReprint = toPositiveInt(story.fk_reprint);
      if (fkReprint != null && !discovered.has(fkReprint)) {
        discovered.add(fkReprint);
        nextFrontier.add(fkReprint);
      }
    }

    frontier = Array.from(nextFrontier);
  }

  return Array.from(discovered);
};

const groupConnectedParents = (parents: StoryWithRelations[]): number[][] => {
  const parentIds = new Set<number>();
  const adjacency = new Map<number, Set<number>>();

  const ensureNode = (id: number) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set<number>());
    parentIds.add(id);
  };

  for (const parent of parents) {
    const parentId = toPositiveInt(parent.id);
    if (parentId == null) continue;
    ensureNode(parentId);

    const fkReprint = toPositiveInt(parent.fk_reprint);
    if (fkReprint == null) continue;
    ensureNode(fkReprint);

    adjacency.get(parentId)?.add(fkReprint);
    adjacency.get(fkReprint)?.add(parentId);
  }

  const visited = new Set<number>();
  const components: number[][] = [];

  for (const id of parentIds) {
    if (visited.has(id)) continue;

    const component: number[] = [];
    const queue = [id];
    visited.add(id);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current == null) continue;
      component.push(current);

      const neighbors = adjacency.get(current);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  return components;
};

async function updateStoryFilterFlagsForParents(
  models: DbModels,
  parentStoryIds: Iterable<number>,
  transaction?: Transaction,
): Promise<void> {
  const initialParentIds = normalizeParentIds(parentStoryIds);
  if (initialParentIds.length === 0) return;

  const recursiveParentIds = await resolveRecursiveRelatedParentIds(
    models,
    initialParentIds,
    transaction,
  );
  if (recursiveParentIds.length === 0) return;

  const parentStoriesRaw = await models.Story.findAll({
    where: { id: { [Op.in]: recursiveParentIds } },
    transaction,
  });
  const parentStories = parentStoriesRaw as StoryWithRelations[];
  if (parentStories.length === 0) return;

  const parentStoryById = new Map<number, StoryWithRelations>();
  for (const parent of parentStories) {
    const parentId = toPositiveInt(parent.id);
    if (parentId != null) parentStoryById.set(parentId, parent);
  }

  const parentGroups = groupConnectedParents(parentStories);
  const allParentIds = Array.from(parentStoryById.keys());

  const childrenRaw = await models.Story.findAll({
    where: { fk_parent: { [Op.in]: allParentIds } },
    include: [
      {
        model: models.Issue,
        as: 'issue',
        attributes: ['format', 'releasedate'],
        required: false,
      },
    ],
    transaction,
  });

  const childrenByParent = new Map<number, StoryWithIssue[]>();
  for (const rawChild of childrenRaw) {
    const child = rawChild as StoryWithIssue;
    const parentId = toPositiveInt(child.fk_parent);
    if (parentId == null) continue;

    const grouped = childrenByParent.get(parentId) || [];
    grouped.push(child);
    childrenByParent.set(parentId, grouped);
  }

  for (const groupParentIds of parentGroups) {
    const parentsInGroup = groupParentIds
      .map((id) => parentStoryById.get(id))
      .filter((entry): entry is StoryWithRelations => Boolean(entry));

    if (parentsInGroup.length === 0) continue;

    const childrenInGroup: StoryWithIssue[] = groupParentIds.flatMap(
      (parentId) => childrenByParent.get(parentId) || [],
    );

    let firstPartialChildId: number | null = null;
    let firstPartialTimestamp = Number.POSITIVE_INFINITY;
    let firstFullChildId: number | null = null;
    let firstFullTimestamp = Number.POSITIVE_INFINITY;
    let tbCount = 0;
    let notTbCount = 0;

    for (const child of childrenInGroup) {
      const childIssue = child.issue;
      const isPocketBook = isPocketBookFormat(childIssue?.format);
      if (isPocketBook) tbCount += 1;
      else notTbCount += 1;

      const releaseTimestamp = toDateTimestamp(childIssue?.releasedate);
      const childId = toPositiveInt(child.id) || Number.MAX_SAFE_INTEGER;
      if (isPartialPublicationStart(child.part)) {
        const bestId = firstPartialChildId ?? Number.MAX_SAFE_INTEGER;
        if (releaseTimestamp < firstPartialTimestamp) {
          firstPartialTimestamp = releaseTimestamp;
          firstPartialChildId = child.id;
        } else if (releaseTimestamp === firstPartialTimestamp && childId < bestId) {
          firstPartialChildId = child.id;
        }
      }

      if (isCompletePublication(child.part)) {
        const bestId = firstFullChildId ?? Number.MAX_SAFE_INTEGER;
        if (releaseTimestamp < firstFullTimestamp) {
          firstFullTimestamp = releaseTimestamp;
          firstFullChildId = child.id;
        } else if (releaseTimestamp === firstFullTimestamp && childId < bestId) {
          firstFullChildId = child.id;
        }
      }
    }

    const singleRelease = childrenInGroup.length === 1;
    const parentOnlyTb = tbCount > 0 && notTbCount === 0;
    const hasOnlyOneNonTb = tbCount > 0 && notTbCount === 1;

    for (const parent of parentsInGroup) {
      let parentChanged = false;

      if (parent.onlytb !== parentOnlyTb) {
        parent.onlytb = parentOnlyTb;
        parentChanged = true;
      }
      if (parent.onlyoneprint !== singleRelease) {
        parent.onlyoneprint = singleRelease;
        parentChanged = true;
      }

      if (parentChanged) {
        await parent.save({ transaction });
      }
    }

    for (const child of childrenInGroup) {
      const childIssue = child.issue;
      const isPocketBook = isPocketBookFormat(childIssue?.format);

      const nextOnlyApp = singleRelease;
      const nextFirstApp =
        (firstPartialChildId != null && child.id === firstPartialChildId) ||
        (firstFullChildId != null && child.id === firstFullChildId);
      const nextOtherOnlyTb = hasOnlyOneNonTb && !isPocketBook;

      let childChanged = false;
      if (child.onlyapp !== nextOnlyApp) {
        child.onlyapp = nextOnlyApp;
        childChanged = true;
      }
      if (child.firstapp !== nextFirstApp) {
        child.firstapp = nextFirstApp;
        childChanged = true;
      }
      if (child.otheronlytb !== nextOtherOnlyTb) {
        child.otheronlytb = nextOtherOnlyTb;
        childChanged = true;
      }
      if (child.onlytb !== false) {
        child.onlytb = false;
        childChanged = true;
      }

      if (childChanged) {
        await child.save({ transaction });
      }
    }
  }
}

export async function updateStoryFilterFlagsForIssue(
  models: DbModels,
  issueId: number,
  transaction?: Transaction,
): Promise<void> {
  const numericIssueId = toPositiveInt(issueId);
  if (numericIssueId == null) return;

  const issue = (await models.Issue.findByPk(numericIssueId, {
    attributes: ['id'],
    include: [
      {
        model: models.Series,
        as: 'series',
        attributes: ['id'],
        required: false,
        include: [
          {
            model: models.Publisher,
            as: 'publisher',
            attributes: ['original'],
            required: false,
          },
        ],
      },
    ],
    transaction,
  })) as (Issue & { series?: { publisher?: { original?: boolean } } }) | null;

  const isUsIssue = Boolean(issue?.series?.publisher?.original);

  const storiesRaw = await models.Story.findAll({
    where: { fk_issue: numericIssueId },
    attributes: ['id', 'fk_parent'],
    transaction,
  });
  const stories = Array.isArray(storiesRaw) ? storiesRaw : [];

  const parentIds = isUsIssue
    ? stories
        .map((story) => (toPositiveInt(story.fk_parent) == null ? toPositiveInt(story.id) : null))
        .filter((id): id is number => id != null)
    : stories
        .map((story) => toPositiveInt(story.fk_parent))
        .filter((id): id is number => id != null);

  await updateStoryFilterFlagsForParents(models, parentIds, transaction);
}
