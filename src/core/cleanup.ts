import { col, Op } from 'sequelize';
import models from '../models';
import logger from '../util/logger';

const MAX_REPORTED_ITEMS = 100;

type CleanupStageResult = {
  step: string;
  count: number;
  ids: number[];
  items: string[];
  truncated: boolean;
};

export type CleanupDryRunReport = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  totalAffected: number;
  stages: CleanupStageResult[];
};

export type CleanupRunOptions = {
  dryRun?: boolean;
};

type PublisherRow = {
  id: number;
  name: string;
  original: boolean;
};

type SeriesRow = {
  id: number;
  title: string;
  volume: number;
  fk_publisher: number | null;
};

type IssueRow = {
  id: number;
  number: string;
  variant: string;
  fk_series: number | null;
};

type CoverRow = {
  id: number;
  fk_issue: number | null;
};

type StoryRow = {
  id: number;
  number: number;
  fk_issue: number | null;
  fk_parent: number | null;
  fk_reprint: number | null;
};

type IndividualRow = {
  id: number;
  name: string;
};

type AppearanceRow = {
  id: number;
  name: string;
  type: string;
};

type ArcRow = {
  id: number;
  title: string;
  type: string;
};

type IssueIndividualRow = {
  fk_individual: number;
  fk_issue: number;
};

type StoryIndividualRow = {
  fk_individual: number;
  fk_story: number;
};

type CoverIndividualRow = {
  fk_individual: number;
  fk_cover: number;
};

type StoryAppearanceRow = {
  fk_appearance: number;
  fk_story: number;
};

type IssueArcRow = {
  fk_arc: number;
  fk_issue: number;
};

const toInt = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const intValue = Math.trunc(num);
  return intValue > 0 ? intValue : null;
};

const uniqueSortedIds = (ids: Iterable<number>): number[] =>
  Array.from(new Set(ids)).sort((a, b) => a - b);

const formatItems = (
  ids: number[],
  formatter: (id: number) => string,
): { items: string[]; truncated: boolean } => {
  const truncated = ids.length > MAX_REPORTED_ITEMS;
  const selected = ids.slice(0, MAX_REPORTED_ITEMS);
  return {
    items: selected.map((id) => formatter(id)),
    truncated,
  };
};

const toStageResult = (
  step: string,
  ids: number[],
  formatter: (id: number) => string,
): CleanupStageResult => {
  const sortedIds = uniqueSortedIds(ids);
  const { items, truncated } = formatItems(sortedIds, formatter);
  return {
    step,
    count: sortedIds.length,
    ids: sortedIds,
    items,
    truncated,
  };
};

const hasActiveRef = (
  joins: Array<{ ownerId: number; refId: number }>,
  ownerId: number,
  activeRefIds: Set<number>,
): boolean => joins.some((join) => join.ownerId === ownerId && activeRefIds.has(join.refId));

const markDeleted = (ids: number[], activeIds: Set<number>) => {
  for (const id of ids) activeIds.delete(id);
};

const toActiveJoinLinks = (
  rows: Array<{ ownerId: unknown; refId: unknown }>,
): Array<{ ownerId: number; refId: number }> =>
  rows
    .map((row) => {
      const ownerId = toInt(row.ownerId);
      const refId = toInt(row.refId);
      if (ownerId == null || refId == null) return null;
      return { ownerId, refId };
    })
    .filter((entry): entry is { ownerId: number; refId: number } => entry != null);

const ownersWithActiveRefs = (
  joins: Array<{ ownerId: number; refId: number }>,
  activeRefIds: Set<number>,
): Set<number> => {
  const owners = new Set<number>();
  for (const join of joins) {
    if (activeRefIds.has(join.refId)) owners.add(join.ownerId);
  }
  return owners;
};

const distinctOwnerIdsForActiveRefs = async (
  joinModel: {
    findAll: (args: Record<string, unknown>) => Promise<unknown[]>;
  },
  ownerField: string,
  refField: string,
  activeRefIds: Set<number>,
  transaction: any,
): Promise<Set<number>> => {
  if (activeRefIds.size === 0) return new Set<number>();
  const activeRefIdList = Array.from(activeRefIds);
  const rows = (await joinModel.findAll({
    attributes: [[col(ownerField), ownerField]],
    group: [ownerField],
    where: {
      [refField]: { [Op.in]: activeRefIdList },
    },
    raw: true,
    transaction,
  })) as Array<Record<string, unknown>>;

  const owners = new Set<number>();
  for (const row of rows) {
    const owner = toInt(row[ownerField]);
    if (owner != null) owners.add(owner);
  }
  return owners;
};

const resolveDryRun = (options?: CleanupRunOptions): boolean => {
  if (typeof options?.dryRun === 'boolean') return options.dryRun;
  return String(process.env.CLEANUP_DRY_RUN || 'false').toLowerCase() === 'true';
};

const deleteByIds = async (
  model: { destroy: (args: Record<string, unknown>) => Promise<number> },
  ids: number[],
  transaction: any,
  dryRun: boolean,
) => {
  if (dryRun || ids.length === 0) return;
  await model.destroy({
    where: { id: { [Op.in]: ids } },
    transaction,
  });
};

const findUSIssueIdsWithoutDEReference = ({
  publishers,
  series,
  issues,
  stories,
}: {
  publishers: PublisherRow[];
  series: SeriesRow[];
  issues: IssueRow[];
  stories: StoryRow[];
}): {
  ids: number[];
  stats: {
    usIssues: number;
    usStories: number;
    nonUSStories: number;
    startStories: number;
    reachableStories: number;
    reachableUSStories: number;
    keptUSIssues: number;
    skipped: boolean;
    reason: string | null;
  };
} => {
  const publisherById = new Map<number, PublisherRow>(publishers.map((row) => [row.id, row]));
  const seriesById = new Map<number, SeriesRow>(series.map((row) => [row.id, row]));
  const issueById = new Map<number, IssueRow>(issues.map((row) => [row.id, row]));

  const resolvePublisherOriginalByIssue = (issueId: number): boolean | null => {
    const issue = issueById.get(issueId);
    if (!issue) return null;
    const seriesItem = issue.fk_series != null ? seriesById.get(issue.fk_series) : null;
    if (!seriesItem || seriesItem.fk_publisher == null) return null;
    const publisher = publisherById.get(seriesItem.fk_publisher);
    return publisher ? Boolean(publisher.original) : null;
  };

  const usIssueIds = new Set<number>();
  const usIssueById = new Map<number, IssueRow>();
  const issueGroupKeyById = new Map<number, string>();
  const usIssueIdsByGroupKey = new Map<string, Set<number>>();
  for (const issue of issues) {
    if (resolvePublisherOriginalByIssue(issue.id) !== true) continue;
    usIssueIds.add(issue.id);
    usIssueById.set(issue.id, issue);

    const seriesId = toInt(issue.fk_series);
    if (seriesId == null) continue;
    const groupKey = `${seriesId}::${issue.number}`;
    issueGroupKeyById.set(issue.id, groupKey);
    if (!usIssueIdsByGroupKey.has(groupKey)) usIssueIdsByGroupKey.set(groupKey, new Set<number>());
    usIssueIdsByGroupKey.get(groupKey)?.add(issue.id);
  }

  const storyById = new Map<number, StoryRow>();
  const usStoryIds = new Set<number>();
  const nonUSStoryIds = new Set<number>();
  for (const story of stories) {
    const storyId = toInt(story.id);
    if (storyId == null) continue;
    storyById.set(storyId, story);

    const issueId = toInt(story.fk_issue);
    if (issueId == null) continue;

    const origin = resolvePublisherOriginalByIssue(issueId);
    if (origin === true) usStoryIds.add(storyId);
    if (origin !== true) nonUSStoryIds.add(storyId);
  }

  if (usStoryIds.size === 0) {
    return {
      ids: [],
      stats: {
        usIssues: usIssueIds.size,
        usStories: 0,
        nonUSStories: nonUSStoryIds.size,
        startStories: nonUSStoryIds.size,
        reachableStories: nonUSStoryIds.size,
        reachableUSStories: 0,
        keptUSIssues: usIssueIds.size,
        skipped: true,
        reason: 'No US stories found; step0 skipped for safety.',
      },
    };
  }

  const adjacency = new Map<number, Set<number>>();
  const ensureNode = (id: number) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set<number>());
  };
  const addUndirectedEdge = (leftId: number, rightId: number) => {
    ensureNode(leftId);
    ensureNode(rightId);
    adjacency.get(leftId)?.add(rightId);
    adjacency.get(rightId)?.add(leftId);
  };

  for (const story of stories) {
    const storyId = toInt(story.id);
    if (storyId == null || !storyById.has(storyId)) continue;
    ensureNode(storyId);

    const reprintId = toInt(story.fk_reprint);
    if (reprintId != null && storyById.has(reprintId)) addUndirectedEdge(storyId, reprintId);

    const parentId = toInt(story.fk_parent);
    if (parentId != null && storyById.has(parentId)) addUndirectedEdge(storyId, parentId);
  }

  const reachableStories = new Set<number>(nonUSStoryIds);
  const queue = Array.from(nonUSStoryIds);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) continue;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (reachableStories.has(neighbor)) continue;
      reachableStories.add(neighbor);
      queue.push(neighbor);
    }
  }

  const keptUSIssueIds = new Set<number>();
  let reachableUSStoryCount = 0;
  for (const storyId of reachableStories) {
    if (!usStoryIds.has(storyId)) continue;
    reachableUSStoryCount += 1;
    const story = storyById.get(storyId);
    const issueId = story ? toInt(story.fk_issue) : null;
    if (issueId != null && usIssueIds.has(issueId)) keptUSIssueIds.add(issueId);
  }

  // Keep full US variant groups (same series + number) if at least one variant is referenced.
  const keptUSIssueIdsExpanded = new Set<number>(keptUSIssueIds);
  for (const keptIssueId of keptUSIssueIds) {
    const groupKey = issueGroupKeyById.get(keptIssueId);
    if (!groupKey) continue;
    const siblingIds = usIssueIdsByGroupKey.get(groupKey);
    if (!siblingIds) continue;
    for (const siblingId of siblingIds) keptUSIssueIdsExpanded.add(siblingId);
  }

  return {
    ids: Array.from(usIssueIds).filter((issueId) => !keptUSIssueIdsExpanded.has(issueId)),
    stats: {
      usIssues: usIssueIds.size,
      usStories: usStoryIds.size,
      nonUSStories: nonUSStoryIds.size,
      startStories: nonUSStoryIds.size,
      reachableStories: reachableStories.size,
      reachableUSStories: reachableUSStoryCount,
      keptUSIssues: keptUSIssueIdsExpanded.size,
      skipped: false,
      reason: null,
    },
  };
};

export async function run(options?: CleanupRunOptions): Promise<CleanupDryRunReport | null> {
  const transaction = await models.sequelize.transaction();
  const startedAt = new Date().toISOString();
  const totalSteps = 11;
  const dryRun = resolveDryRun(options);

  try {
    logger.info(`[cleanup] progress 0/${totalSteps} (0%) - loading data snapshot...`);
    const [
      publishersRaw,
      seriesRaw,
      issuesRaw,
      coversRaw,
      storiesRaw,
      individualsRaw,
      appearancesRaw,
      arcsRaw,
    ] = await Promise.all([
      models.Publisher.findAll({
        attributes: ['id', 'name', 'original'],
        transaction,
      }),
      models.Series.findAll({
        attributes: ['id', 'title', 'volume', 'fk_publisher'],
        transaction,
      }),
      models.Issue.findAll({
        attributes: ['id', 'number', 'variant', 'fk_series'],
        transaction,
      }),
      models.Cover.findAll({
        attributes: ['id', 'fk_issue'],
        transaction,
      }),
      models.Story.findAll({
        attributes: ['id', 'number', 'fk_issue', 'fk_parent', 'fk_reprint'],
        transaction,
      }),
      models.Individual.findAll({
        attributes: ['id', 'name'],
        transaction,
      }),
      models.Appearance.findAll({
        attributes: ['id', 'name', 'type'],
        transaction,
      }),
      models.Arc.findAll({
        attributes: ['id', 'title', 'type'],
        transaction,
      }),
    ]);

    const publishers = (publishersRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          name: String(row.name || ''),
          original: Boolean(row.original),
        } as PublisherRow;
      })
      .filter((entry): entry is PublisherRow => entry != null);

    const series = (seriesRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          title: String(row.title || ''),
          volume: Number(row.volume || 0),
          fk_publisher: toInt(row.fk_publisher),
        } as SeriesRow;
      })
      .filter((entry): entry is SeriesRow => entry != null);

    const issues = (issuesRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          number: String(row.number || ''),
          variant: String(row.variant || ''),
          fk_series: toInt(row.fk_series),
        } as IssueRow;
      })
      .filter((entry): entry is IssueRow => entry != null);

    const covers = (coversRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          fk_issue: toInt(row.fk_issue),
        } as CoverRow;
      })
      .filter((entry): entry is CoverRow => entry != null);

    const stories = (storiesRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          number: Number(row.number || 0),
          fk_issue: toInt(row.fk_issue),
          fk_parent: toInt(row.fk_parent),
          fk_reprint: toInt(row.fk_reprint),
        } as StoryRow;
      })
      .filter((entry): entry is StoryRow => entry != null);

    const individuals = (individualsRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          name: String(row.name || ''),
        } as IndividualRow;
      })
      .filter((entry): entry is IndividualRow => entry != null);

    const appearances = (appearancesRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          name: String(row.name || ''),
          type: String(row.type || ''),
        } as AppearanceRow;
      })
      .filter((entry): entry is AppearanceRow => entry != null);

    const arcs = (arcsRaw as unknown as Array<Record<string, unknown>>)
      .map((row) => {
        const id = toInt(row.id);
        if (id == null) return null;
        return {
          id,
          title: String(row.title || ''),
          type: String(row.type || ''),
        } as ArcRow;
      })
      .filter((entry): entry is ArcRow => entry != null);

    const publisherById = new Map<number, PublisherRow>(publishers.map((row) => [row.id, row]));
    const seriesById = new Map<number, SeriesRow>(series.map((row) => [row.id, row]));
    const issueById = new Map<number, IssueRow>(issues.map((row) => [row.id, row]));
    const coverById = new Map<number, CoverRow>(covers.map((row) => [row.id, row]));
    const storyById = new Map<number, StoryRow>(stories.map((row) => [row.id, row]));
    const individualById = new Map<number, IndividualRow>(individuals.map((row) => [row.id, row]));
    const appearanceById = new Map<number, AppearanceRow>(appearances.map((row) => [row.id, row]));
    const arcById = new Map<number, ArcRow>(arcs.map((row) => [row.id, row]));

    const activePublisherIds = new Set(publishers.map((row) => row.id));
    const activeSeriesIds = new Set(series.map((row) => row.id));
    const activeIssueIds = new Set(issues.map((row) => row.id));
    const activeCoverIds = new Set(covers.map((row) => row.id));
    const activeStoryIds = new Set(stories.map((row) => row.id));
    const activeIndividualIds = new Set(individuals.map((row) => row.id));
    const activeAppearanceIds = new Set(appearances.map((row) => row.id));
    const activeArcIds = new Set(arcs.map((row) => row.id));

    const stages: CleanupStageResult[] = [];
    let completedSteps = 0;

    const addStage = (stage: CleanupStageResult) => {
      stages.push(stage);
      completedSteps += 1;
      const percent = Math.round((completedSteps / totalSteps) * 100);
      logger.info(
        `[cleanup] progress ${completedSteps}/${totalSteps} (${percent}%) - ${stage.step}: ${stage.count}`,
      );
    };

    logger.info(`[cleanup] progress 0/${totalSteps} (0%) - loaded data snapshot.`);

    const stepMinus1StoryIds = stories
      .filter((story) => activeStoryIds.has(story.id))
      .filter((story) => toInt(story.fk_issue) == null)
      .map((story) => story.id);
    addStage(
      toStageResult('-1) Stories without issue (direct orphan)', stepMinus1StoryIds, (id) => {
        const story = storyById.get(id);
        return `Story#${id} number=${story?.number ?? '?'} fk_issue=${story?.fk_issue ?? 'null'}`;
      }),
    );
    await deleteByIds(models.Story, stepMinus1StoryIds, transaction, dryRun);
    markDeleted(stepMinus1StoryIds, activeStoryIds);

    const step0Result = findUSIssueIdsWithoutDEReference({
      publishers,
      series,
      issues,
      stories,
    });
    const step0IssueIds = step0Result.ids;
    addStage(
      toStageResult('0) US issues without any DE reference chain', step0IssueIds, (id) => {
        const issue = issueById.get(id);
        const seriesItem =
          issue && issue.fk_series != null ? seriesById.get(issue.fk_series) : null;
        const publisher =
          seriesItem && seriesItem.fk_publisher != null
            ? publisherById.get(seriesItem.fk_publisher)
            : null;
        return `Issue#${id} number=${issue?.number || '?'} variant=${issue?.variant || ''} series="${seriesItem?.title || '?'}" publisher="${publisher?.name || '?'}"`;
      }),
    );
    await deleteByIds(models.Issue, step0IssueIds, transaction, dryRun);
    markDeleted(step0IssueIds, activeIssueIds);

    const step1PublisherIds = publishers
      .filter((publisher) => activePublisherIds.has(publisher.id))
      .filter(
        (publisher) =>
          !series.some(
            (seriesItem) =>
              activeSeriesIds.has(seriesItem.id) && toInt(seriesItem.fk_publisher) === publisher.id,
          ),
      )
      .map((publisher) => publisher.id);
    addStage(
      toStageResult('1) Publisher without series', step1PublisherIds, (id) => {
        const publisher = publisherById.get(id);
        return `Publisher#${id} "${publisher?.name || '?'}"`;
      }),
    );
    await deleteByIds(models.Publisher, step1PublisherIds, transaction, dryRun);
    markDeleted(step1PublisherIds, activePublisherIds);

    const step2SeriesIds = series
      .filter((seriesItem) => activeSeriesIds.has(seriesItem.id))
      .filter(
        (seriesItem) =>
          !issues.some(
            (issue) => activeIssueIds.has(issue.id) && toInt(issue.fk_series) === seriesItem.id,
          ),
      )
      .map((seriesItem) => seriesItem.id);
    addStage(
      toStageResult('2) Series without issues', step2SeriesIds, (id) => {
        const seriesItem = seriesById.get(id);
        return `Series#${id} "${seriesItem?.title || '?'}" volume=${seriesItem?.volume ?? '?'}`;
      }),
    );
    await deleteByIds(models.Series, step2SeriesIds, transaction, dryRun);
    markDeleted(step2SeriesIds, activeSeriesIds);

    const step3SeriesIds = series
      .filter((seriesItem) => activeSeriesIds.has(seriesItem.id))
      .filter((seriesItem) => {
        const publisherId = toInt(seriesItem.fk_publisher);
        return publisherId == null || !activePublisherIds.has(publisherId);
      })
      .map((seriesItem) => seriesItem.id);
    addStage(
      toStageResult('3) Series without publisher', step3SeriesIds, (id) => {
        const seriesItem = seriesById.get(id);
        return `Series#${id} "${seriesItem?.title || '?'}" volume=${seriesItem?.volume ?? '?'}`;
      }),
    );
    await deleteByIds(models.Series, step3SeriesIds, transaction, dryRun);
    markDeleted(step3SeriesIds, activeSeriesIds);

    const step4IssueIds = issues
      .filter((issue) => activeIssueIds.has(issue.id))
      .filter((issue) => {
        const seriesId = toInt(issue.fk_series);
        return seriesId == null || !activeSeriesIds.has(seriesId);
      })
      .map((issue) => issue.id);
    addStage(
      toStageResult('4) Issues without series', step4IssueIds, (id) => {
        const issue = issueById.get(id);
        return `Issue#${id} number=${issue?.number || '?'} variant=${issue?.variant || ''}`;
      }),
    );
    await deleteByIds(models.Issue, step4IssueIds, transaction, dryRun);
    markDeleted(step4IssueIds, activeIssueIds);

    const step5CoverIds = covers
      .filter((cover) => activeCoverIds.has(cover.id))
      .filter((cover) => {
        const issueId = toInt(cover.fk_issue);
        return issueId == null || !activeIssueIds.has(issueId);
      })
      .map((cover) => cover.id);
    addStage(
      toStageResult('5) Covers without issue', step5CoverIds, (id) => {
        const cover = coverById.get(id);
        return `Cover#${id} fk_issue=${cover?.fk_issue ?? 'null'}`;
      }),
    );
    await deleteByIds(models.Cover, step5CoverIds, transaction, dryRun);
    markDeleted(step5CoverIds, activeCoverIds);

    const step6StoryIds = stories
      .filter((story) => activeStoryIds.has(story.id))
      .filter((story) => {
        const issueId = toInt(story.fk_issue);
        return issueId == null || !activeIssueIds.has(issueId);
      })
      .map((story) => story.id);
    addStage(
      toStageResult('6) Stories without issue (after issue cleanup)', step6StoryIds, (id) => {
        const story = storyById.get(id);
        return `Story#${id} number=${story?.number ?? '?'} fk_issue=${story?.fk_issue ?? 'null'}`;
      }),
    );
    await deleteByIds(models.Story, step6StoryIds, transaction, dryRun);
    markDeleted(step6StoryIds, activeStoryIds);

    const [issueLinkedIndividualIds, storyLinkedIndividualIds, coverLinkedIndividualIds] =
      await Promise.all([
        distinctOwnerIdsForActiveRefs(
          models.Issue_Individual,
          'fk_individual',
          'fk_issue',
          activeIssueIds,
          transaction,
        ),
        distinctOwnerIdsForActiveRefs(
          models.Story_Individual,
          'fk_individual',
          'fk_story',
          activeStoryIds,
          transaction,
        ),
        distinctOwnerIdsForActiveRefs(
          models.Cover_Individual,
          'fk_individual',
          'fk_cover',
          activeCoverIds,
          transaction,
        ),
      ]);

    const step7IndividualIds = individuals
      .filter((individual) => activeIndividualIds.has(individual.id))
      .filter((individual) => {
        return (
          !issueLinkedIndividualIds.has(individual.id) &&
          !storyLinkedIndividualIds.has(individual.id) &&
          !coverLinkedIndividualIds.has(individual.id)
        );
      })
      .map((individual) => individual.id);
    addStage(
      toStageResult('7) Individuals without story, cover or issue', step7IndividualIds, (id) => {
        const individual = individualById.get(id);
        return `Individual#${id} "${individual?.name || '?'}"`;
      }),
    );
    await deleteByIds(models.Individual, step7IndividualIds, transaction, dryRun);
    markDeleted(step7IndividualIds, activeIndividualIds);

    const storyLinkedAppearanceIds = await distinctOwnerIdsForActiveRefs(
      models.Story_Appearance,
      'fk_appearance',
      'fk_story',
      activeStoryIds,
      transaction,
    );
    const step8AppearanceIds = appearances
      .filter((appearance) => activeAppearanceIds.has(appearance.id))
      .filter((appearance) => !storyLinkedAppearanceIds.has(appearance.id))
      .map((appearance) => appearance.id);
    addStage(
      toStageResult('8) Appearances without story', step8AppearanceIds, (id) => {
        const appearance = appearanceById.get(id);
        return `Appearance#${id} "${appearance?.name || '?'}" type=${appearance?.type || '?'}`;
      }),
    );
    await deleteByIds(models.Appearance, step8AppearanceIds, transaction, dryRun);
    markDeleted(step8AppearanceIds, activeAppearanceIds);

    const issueLinkedArcIds = await distinctOwnerIdsForActiveRefs(
      models.Issue_Arc,
      'fk_arc',
      'fk_issue',
      activeIssueIds,
      transaction,
    );
    const step9ArcIds = arcs
      .filter((arc) => activeArcIds.has(arc.id))
      .filter((arc) => !issueLinkedArcIds.has(arc.id))
      .map((arc) => arc.id);
    addStage(
      toStageResult('9) Arcs without issue', step9ArcIds, (id) => {
        const arc = arcById.get(id);
        return `Arc#${id} "${arc?.title || '?'}" type=${arc?.type || '?'}`;
      }),
    );
    await deleteByIds(models.Arc, step9ArcIds, transaction, dryRun);
    markDeleted(step9ArcIds, activeArcIds);

    const totalAffected = stages.reduce((sum, stage) => sum + stage.count, 0);
    const finishedAt = new Date().toISOString();
    const report: CleanupDryRunReport = {
      dryRun,
      startedAt,
      finishedAt,
      totalAffected,
      stages,
    };

    if (dryRun) await transaction.rollback();
    else await transaction.commit();
    return report;
  } catch (e) {
    await transaction.rollback();
    return null;
  }
}

export async function triggerManualCleanupDryRun(): Promise<CleanupDryRunReport | null> {
  return run({ dryRun: true });
}
