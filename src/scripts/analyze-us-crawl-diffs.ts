import fs from 'fs/promises';
import path from 'path';
import { QueryTypes, Op } from 'sequelize';
import db from '../models';
import { MarvelCrawlerService } from '../services/MarvelCrawlerService';
import { request } from 'undici';

type Args = {
  limit?: number;
  concurrency: number;
  batchSize: number;
  out: string;
  idsFromReport?: string;
  failuresOnlyFromReport?: boolean;
};

type IssueRow = {
  id: number;
};

type VariantCountRow = {
  issue_id: number;
  variant_count: number;
};

type BasicMetadataUpdate = {
  field: 'series.startyear' | 'series.endyear' | 'series.publisher' | 'releasedate';
  db: string | number;
  crawl: string | number;
};

type IssueComparison = {
  label: string;
  id: number;
  variantCount: number;
  crawlFailed: false;
  storyCountMismatch: boolean;
  arcsMismatch: boolean;
  storyPresenceMismatches: Array<{ number: number; db: boolean; crawl: boolean }>;
  storyIndividualMismatches: Array<{
    number: number;
    onlyLeft: string[];
    onlyRight: string[];
    equal: boolean;
  }>;
  storyAppearanceMismatches: Array<{
    number: number;
    onlyLeft: string[];
    onlyRight: string[];
    equal: boolean;
  }>;
  reprintFlagMismatches: Array<{ number: number; db: boolean; crawl: boolean }>;
  metadataUpdates: BasicMetadataUpdate[];
  coverArtistsMismatch: boolean;
};

type CrawlFailure = {
  label: string;
  id: number;
  variantCount: number;
  crawlFailed: true;
  error: string;
  direct: unknown[];
  searchHits: string[];
};

type StorySnapshot = {
  number: number;
  hasReprintOf: boolean;
  individuals: Set<string>;
  appearances: Set<string>;
};

type NormalizedIssue = {
  id: number;
  label: string;
  number: string;
  releasedate: string;
  series: {
    title: string;
    volume: number;
    startyear: number;
    endyear: number;
    publisherName: string;
  };
  coverIndividuals: Set<string>;
  arcs: Set<string>;
  storyCount: number;
  stories: Map<number, StorySnapshot>;
  variantCount: number;
};

const API = 'https://marvel.fandom.com/api.php';
const USER_AGENT = 'shortbox-crawler/1.1 (+https://shortbox.de)';

function parseArgs(argv: string[]): Args {
  const args: Args = {
    concurrency: 4,
    batchSize: 100,
    out: path.resolve(process.cwd(), 'reports/us-issue-crawl-analysis.json'),
    failuresOnlyFromReport: false,
  };

  for (const raw of argv) {
    if (raw.startsWith('--limit=')) {
      const value = Number(raw.slice('--limit='.length));
      if (Number.isFinite(value) && value > 0) args.limit = value;
      continue;
    }
    if (raw.startsWith('--concurrency=')) {
      const value = Number(raw.slice('--concurrency='.length));
      if (Number.isFinite(value) && value > 0) args.concurrency = Math.max(1, Math.floor(value));
      continue;
    }
    if (raw.startsWith('--out=')) {
      args.out = path.resolve(process.cwd(), raw.slice('--out='.length));
      continue;
    }
    if (raw.startsWith('--batch-size=')) {
      const value = Number(raw.slice('--batch-size='.length));
      if (Number.isFinite(value) && value > 0) args.batchSize = Math.max(1, Math.floor(value));
      continue;
    }
    if (raw.startsWith('--ids-from-report=')) {
      args.idsFromReport = path.resolve(process.cwd(), raw.slice('--ids-from-report='.length));
      continue;
    }
    if (raw === '--failures-only-from-report') {
      args.failuresOnlyFromReport = true;
    }
  }

  return args;
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatDbDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString().slice(0, 10);
    const [year, month, day] = iso.split('-');
    return `${day}.${month}.${year}`;
  }
  const text = String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function throughValue(entity: Record<string, unknown> | undefined, key: string): string {
  if (!entity) return '';
  const record = entity as Record<string, Record<string, string> | undefined>;
  return (
    record.issue_individual?.[key] ||
    record.story_individual?.[key] ||
    record.cover_individual?.[key] ||
    record.story_appearance?.[key] ||
    ''
  );
}

function keyOfParts(parts: unknown[]): string {
  return parts.map((part) => normalizeText(part)).join(' | ');
}

function makeSet(items: string[]): Set<string> {
  return new Set(items.filter(Boolean).map((item) => normalizeText(item)));
}

function diffSets(left: Set<string>, right: Set<string>) {
  const onlyLeft = [...left].filter((item) => !right.has(item)).sort((a, b) => a.localeCompare(b));
  const onlyRight = [...right].filter((item) => !left.has(item)).sort((a, b) => a.localeCompare(b));
  return { onlyLeft, onlyRight, equal: onlyLeft.length === 0 && onlyRight.length === 0 };
}

async function apiGet(params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  const url = `${API}?${qs.toString()}`;
  const response = await request(url, { headers: { 'user-agent': USER_AGENT } });
  const text = await response.body.text();
  return JSON.parse(text);
}

async function inspectFailure(seriesTitle: string, volume: number, number: string) {
  const pageTitle = `${seriesTitle.replace(/ /g, '_')}_Vol_${volume}_${number.replace(/ /g, '_')}`;
  const direct = (await apiGet({
    action: 'query',
    redirects: '1',
    titles: pageTitle,
  })) as { query?: { pages?: unknown[] } };
  const search = (await apiGet({
    action: 'query',
    list: 'search',
    srsearch: `${seriesTitle} Vol ${volume} ${number}`,
    srlimit: '12',
  })) as { query?: { search?: Array<{ title?: string }> } };

  return {
    direct: direct?.query?.pages || [],
    searchHits: (search?.query?.search || []).map((entry) => normalizeText(entry.title)),
  };
}

function normalizeDbIssue(issue: Record<string, any>, variantCount: number): NormalizedIssue {
  const series = issue.series || {};
  const publisher = series.publisher || {};
  const mainCover =
    [...(issue.covers || [])].sort((left, right) => Number(left.number || 0) - Number(right.number || 0))[0] || null;
  const stories = new Map<number, StorySnapshot>();

  for (const story of issue.stories || []) {
    stories.set(Number(story.number), {
      number: Number(story.number),
      hasReprintOf: Boolean(story.fk_reprint),
      individuals: makeSet(
        (story.individuals || []).map((individual: Record<string, unknown>) =>
          keyOfParts([individual.name, throughValue(individual, 'type')]),
        ),
      ),
      appearances: makeSet(
        (story.appearances || []).map((appearance: Record<string, unknown>) =>
          keyOfParts([appearance.name, appearance.type, throughValue(appearance, 'role')]),
        ),
      ),
    });
  }

  return {
    id: Number(issue.id),
    label: `${series.title} (Vol. ${series.volume}) #${issue.number}`,
    number: normalizeText(issue.number),
    releasedate: formatDbDate(issue.releasedate),
    series: {
      title: normalizeText(series.title),
      volume: Number(series.volume || 0),
      startyear: Number(series.startyear || 0),
      endyear: Number(series.endyear || 0),
      publisherName: normalizeText(publisher.name),
    },
    coverIndividuals: makeSet(
      (mainCover?.individuals || []).map((individual: Record<string, unknown>) =>
        keyOfParts([individual.name, throughValue(individual, 'type')]),
      ),
    ),
    arcs: makeSet((issue.arcs || []).map((arc: Record<string, unknown>) => keyOfParts([arc.title, arc.type]))),
    storyCount: stories.size,
    stories,
    variantCount,
  };
}

function normalizeCrawlIssue(issue: Record<string, any>): Omit<NormalizedIssue, 'id' | 'label'> {
  const series = issue.series || {};
  const publisher = series.publisher || {};
  const cover = issue.cover || {};
  const stories = new Map<number, StorySnapshot>();

  for (const story of issue.stories || []) {
    stories.set(Number(story.number), {
      number: Number(story.number),
      hasReprintOf: Boolean(story.reprintOf),
      individuals: makeSet(
        (story.individuals || []).map((individual: Record<string, unknown>) =>
          keyOfParts([individual.name, individual.type]),
        ),
      ),
      appearances: makeSet(
        (story.appearances || []).map((appearance: Record<string, unknown>) =>
          keyOfParts([appearance.name, appearance.type, appearance.role || '']),
        ),
      ),
    });
  }

  return {
    number: normalizeText(issue.number),
    releasedate: normalizeText(issue.releasedate),
    series: {
      title: normalizeText(series.title),
      volume: Number(series.volume || 0),
      startyear: Number(series.startyear || 0),
      endyear: Number(series.endyear || 0),
      publisherName: normalizeText(publisher.name),
    },
    coverIndividuals: makeSet(
      (cover.individuals || []).map((individual: Record<string, unknown>) =>
        keyOfParts([individual.name, individual.type]),
      ),
    ),
    arcs: makeSet((issue.arcs || []).map((arc: Record<string, unknown>) => keyOfParts([arc.title, arc.type]))),
    storyCount: stories.size,
    stories,
    variantCount: Array.isArray(issue.variants) ? issue.variants.length : 0,
  };
}

function compareIssues(dbIssue: NormalizedIssue, crawlIssue: Omit<NormalizedIssue, 'id' | 'label'>): IssueComparison {
  const summary: IssueComparison = {
    label: dbIssue.label,
    id: dbIssue.id,
    variantCount: dbIssue.variantCount,
    crawlFailed: false,
    storyCountMismatch: false,
    arcsMismatch: false,
    storyPresenceMismatches: [],
    storyIndividualMismatches: [],
    storyAppearanceMismatches: [],
    reprintFlagMismatches: [],
    metadataUpdates: [],
    coverArtistsMismatch: false,
  };

  const metadataFields: Array<[BasicMetadataUpdate['field'], string | number, string | number]> = [
    ['series.startyear', dbIssue.series.startyear, crawlIssue.series.startyear],
    ['series.endyear', dbIssue.series.endyear, crawlIssue.series.endyear],
    ['series.publisher', dbIssue.series.publisherName, crawlIssue.series.publisherName],
    ['releasedate', dbIssue.releasedate, crawlIssue.releasedate],
  ];

  for (const [field, left, right] of metadataFields) {
    if (String(left) !== String(right)) summary.metadataUpdates.push({ field, db: left, crawl: right });
  }

  summary.storyCountMismatch = dbIssue.storyCount !== crawlIssue.storyCount;
  summary.coverArtistsMismatch = !diffSets(dbIssue.coverIndividuals, crawlIssue.coverIndividuals).equal;
  summary.arcsMismatch = !diffSets(dbIssue.arcs, crawlIssue.arcs).equal;

  const storyNumbers = new Set<number>([...dbIssue.stories.keys(), ...crawlIssue.stories.keys()]);
  for (const storyNumber of [...storyNumbers].sort((left, right) => left - right)) {
    const dbStory = dbIssue.stories.get(storyNumber);
    const crawlStory = crawlIssue.stories.get(storyNumber);
    if (!dbStory || !crawlStory) {
      summary.storyPresenceMismatches.push({
        number: storyNumber,
        db: Boolean(dbStory),
        crawl: Boolean(crawlStory),
      });
      continue;
    }

    if (dbStory.hasReprintOf !== crawlStory.hasReprintOf) {
      summary.reprintFlagMismatches.push({
        number: storyNumber,
        db: dbStory.hasReprintOf,
        crawl: crawlStory.hasReprintOf,
      });
    }

    const individualDiff = diffSets(dbStory.individuals, crawlStory.individuals);
    if (!individualDiff.equal) summary.storyIndividualMismatches.push({ number: storyNumber, ...individualDiff });

    const appearanceDiff = diffSets(dbStory.appearances, crawlStory.appearances);
    if (!appearanceDiff.equal) summary.storyAppearanceMismatches.push({ number: storyNumber, ...appearanceDiff });
  }

  return summary;
}

function pushSample<T>(target: T[], value: T, limit = 50) {
  if (target.length < limit) target.push(value);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runNext = async (): Promise<void> => {
    const current = cursor;
    cursor += 1;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    await runNext();
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(
    `[crawl-diff] starting concurrency=${args.concurrency} limit=${args.limit ?? 'all'} out=${args.out}`,
  );

  const baseRows = (await db.sequelize.query(
    `
      select i.id
      from shortbox.issue i
      join shortbox.series s on s.id = i.fk_series
      join shortbox.publisher p on p.id = s.fk_publisher
      where p.original = true
        and coalesce(i.variant, '') = ''
      order by s.title asc, s.volume asc, i.number asc, i.id asc
      ${args.limit ? `limit ${args.limit}` : ''}
    `,
    { type: QueryTypes.SELECT },
  )) as IssueRow[];

  let ids = baseRows.map((row) => Number(row.id));

  if (args.idsFromReport) {
    const source = JSON.parse(await fs.readFile(args.idsFromReport, 'utf8')) as {
      openCrawlFailures?: Array<{ id?: number }>;
      hardConflicts?: { issues?: Array<{ id?: number }> };
    };
    const failureIds = (source.openCrawlFailures || [])
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));
    const hardConflictIds = ((source.hardConflicts && source.hardConflicts.issues) || [])
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));
    const selectedIds = new Set<number>(
      args.failuresOnlyFromReport ? failureIds : [...failureIds, ...hardConflictIds],
    );
    ids = ids.filter((id) => selectedIds.has(id));
  }

  if (ids.length === 0) throw new Error('No US issues found.');

  console.log(`[crawl-diff] loaded ${ids.length} US issues from DB`);

  const crawler = new MarvelCrawlerService();
  const totalBatches = Math.ceil(ids.length / args.batchSize);
  const output = {
    generatedAt: new Date().toISOString(),
    config: {
      limit: args.limit ?? null,
      concurrency: args.concurrency,
      batchSize: args.batchSize,
      out: args.out,
    },
    totals: {
      total: ids.length,
      crawlFailed: 0,
      successful: 0,
    },
    hardConflicts: {
      storyCountMismatchIssues: 0,
      storyPresenceMismatchIssues: 0,
      reprintFlagMismatchIssues: 0,
      issues: [] as Array<{
        label: string;
        variantCount: number;
        storyCountMismatch: boolean;
        storyPresenceMismatches: Array<{ number: number; db: boolean; crawl: boolean }>;
        reprintFlagMismatches: Array<{ number: number; db: boolean; crawl: boolean }>;
      }>,
    },
    likelyCrawlerRight: {
      metadataUpdateIssues: 0,
      arcsMismatchIssues: 0,
      storyIndividualMismatchIssues: 0,
      storyAppearanceMismatchIssues: 0,
      coverArtistsMismatchIssues: 0,
      sampleMetadata: [] as Array<{
        label: string;
        variantCount: number;
        items: BasicMetadataUpdate[];
      }>,
      sampleArcs: [] as Array<{ label: string; variantCount: number }>,
      sampleStoryIndividuals: [] as Array<{
        label: string;
        variantCount: number;
        items: IssueComparison["storyIndividualMismatches"];
      }>,
      sampleStoryAppearances: [] as Array<{
        label: string;
        variantCount: number;
        items: IssueComparison["storyAppearanceMismatches"];
      }>,
      sampleCoverArtists: [] as Array<{ label: string; variantCount: number }>,
    },
    openCrawlFailures: [] as CrawlFailure[],
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
    const batchIds = ids.slice(batchIndex * args.batchSize, (batchIndex + 1) * args.batchSize);
    console.log(
      `[crawl-diff] batch ${batchIndex + 1}/${totalBatches} loading ${batchIds.length} issues with relations`,
    );

    const variantRows = (await db.sequelize.query(
      `
        select base.id as issue_id, greatest(count(variant.id) - 1, 0) as variant_count
        from shortbox.issue base
        left join shortbox.issue variant
          on variant.fk_series = base.fk_series
         and variant.number = base.number
        where base.id in (:ids)
        group by base.id
      `,
      { replacements: { ids: batchIds }, type: QueryTypes.SELECT },
    )) as VariantCountRow[];

    const variantCountByIssueId = new Map(
      variantRows.map((row) => [Number(row.issue_id), Number(row.variant_count)]),
    );

    const issues = await db.Issue.findAll({
      where: { id: { [Op.in]: batchIds } },
      include: [
        {
          model: db.Series,
          as: 'series',
          required: true,
          include: [{ model: db.Publisher, as: 'publisher', required: true }],
        },
        {
          model: db.Cover,
          as: 'covers',
          required: false,
          include: [
            {
              model: db.Individual,
              as: 'individuals',
              through: { attributes: ['type'] },
              required: false,
            },
          ],
        },
        {
          model: db.Arc,
          as: 'arcs',
          required: false,
        },
        {
          model: db.Story,
          as: 'stories',
          required: false,
          include: [
            {
              model: db.Individual,
              as: 'individuals',
              through: { attributes: ['type'] },
              required: false,
            },
            {
              model: db.Appearance,
              as: 'appearances',
              through: { attributes: ['role'] },
              required: false,
            },
          ],
        },
      ],
      order: [
        [{ model: db.Series, as: 'series' }, 'title', 'ASC'],
        [{ model: db.Series, as: 'series' }, 'volume', 'ASC'],
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    console.log(
      `[crawl-diff] batch ${batchIndex + 1}/${totalBatches} hydrated ${issues.length} issues`,
    );

    const batchReports = await runWithConcurrency(issues, args.concurrency, async (issue, index) => {
      const globalIndex = batchIndex * args.batchSize + index + 1;
      const dbIssue = normalizeDbIssue(
        issue.get({ plain: true }) as Record<string, any>,
        variantCountByIssueId.get(Number(issue.id)) || 0,
      );
      console.log(`[crawl-diff] ${globalIndex}/${ids.length} start ${dbIssue.label}`);

      try {
        const crawled = await crawler.crawlIssue(dbIssue.series.title, dbIssue.series.volume, dbIssue.number);
        const comparison = compareIssues(dbIssue, normalizeCrawlIssue(crawled as Record<string, any>));
        const hardFlags =
          Number(comparison.storyCountMismatch) +
          Number(comparison.storyPresenceMismatches.length > 0) +
          Number(comparison.reprintFlagMismatches.length > 0);
        const softFlags =
          Number(comparison.metadataUpdates.length > 0) +
          Number(comparison.arcsMismatch) +
          Number(comparison.storyIndividualMismatches.length > 0) +
          Number(comparison.storyAppearanceMismatches.length > 0) +
          Number(comparison.coverArtistsMismatch);
        console.log(
          `[crawl-diff] ${globalIndex}/${ids.length} done ${dbIssue.label} hard=${hardFlags} soft=${softFlags}`,
        );
        return comparison;
      } catch (error) {
        const inspection = await inspectFailure(dbIssue.series.title, dbIssue.series.volume, dbIssue.number);
        console.log(
          `[crawl-diff] ${globalIndex}/${ids.length} failed ${dbIssue.label}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        const failure: CrawlFailure = {
          label: dbIssue.label,
          id: dbIssue.id,
          variantCount: dbIssue.variantCount,
          crawlFailed: true,
          error: error instanceof Error ? error.message : String(error),
          direct: inspection.direct,
          searchHits: inspection.searchHits,
        };
        return failure;
      }
    });

    for (const report of batchReports) {
      if (report.crawlFailed) {
        output.totals.crawlFailed += 1;
        output.openCrawlFailures.push(report);
        continue;
      }

      output.totals.successful += 1;

      if (report.storyCountMismatch) output.hardConflicts.storyCountMismatchIssues += 1;
      if (report.storyPresenceMismatches.length > 0) output.hardConflicts.storyPresenceMismatchIssues += 1;
      if (report.reprintFlagMismatches.length > 0) output.hardConflicts.reprintFlagMismatchIssues += 1;
      if (
        report.storyCountMismatch ||
        report.storyPresenceMismatches.length > 0 ||
        report.reprintFlagMismatches.length > 0
      ) {
        output.hardConflicts.issues.push({
          label: report.label,
          variantCount: report.variantCount,
          storyCountMismatch: report.storyCountMismatch,
          storyPresenceMismatches: report.storyPresenceMismatches,
          reprintFlagMismatches: report.reprintFlagMismatches,
        });
      }

      if (report.metadataUpdates.length > 0) {
        output.likelyCrawlerRight.metadataUpdateIssues += 1;
        pushSample(output.likelyCrawlerRight.sampleMetadata, {
          label: report.label,
          variantCount: report.variantCount,
          items: report.metadataUpdates,
        });
      }
      if (report.arcsMismatch) {
        output.likelyCrawlerRight.arcsMismatchIssues += 1;
        pushSample(output.likelyCrawlerRight.sampleArcs, {
          label: report.label,
          variantCount: report.variantCount,
        });
      }
      if (report.storyIndividualMismatches.length > 0) {
        output.likelyCrawlerRight.storyIndividualMismatchIssues += 1;
        pushSample(output.likelyCrawlerRight.sampleStoryIndividuals, {
          label: report.label,
          variantCount: report.variantCount,
          items: report.storyIndividualMismatches,
        });
      }
      if (report.storyAppearanceMismatches.length > 0) {
        output.likelyCrawlerRight.storyAppearanceMismatchIssues += 1;
        pushSample(output.likelyCrawlerRight.sampleStoryAppearances, {
          label: report.label,
          variantCount: report.variantCount,
          items: report.storyAppearanceMismatches,
        });
      }
      if (report.coverArtistsMismatch) {
        output.likelyCrawlerRight.coverArtistsMismatchIssues += 1;
        pushSample(output.likelyCrawlerRight.sampleCoverArtists, {
          label: report.label,
          variantCount: report.variantCount,
        });
      }
    }

    console.log(
      `[crawl-diff] batch ${batchIndex + 1}/${totalBatches} done accumulated=${
        output.totals.successful + output.totals.crawlFailed
      }/${ids.length}`,
    );
    output.generatedAt = new Date().toISOString();
    await fs.writeFile(args.out, JSON.stringify(output, null, 2));
  }

  console.log(
    `[crawl-diff] done total=${output.totals.total} hard=${output.hardConflicts.issues.length} failures=${output.openCrawlFailures.length} -> ${args.out}`,
  );

  await db.sequelize.close();
}

main().catch(async (error) => {
  console.error('[crawl-diff] failed', error);
  await db.sequelize.close();
  process.exitCode = 1;
});
