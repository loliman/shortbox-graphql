import { Op } from 'sequelize';
import logger from '../util/logger';
import { MarvelCrawlerService } from '../services/MarvelCrawlerService';
import { closeDbModels, createDbModels } from './db-model-factory';
import { DbModels } from '../types/db';
import type {
  CrawledAppearance,
  CrawledArc,
  CrawledCover,
  CrawledIndividual,
  CrawledIssue,
  CrawledStory,
} from '../services/MarvelCrawlerService';

type ReimportScope =
  | { kind: 'all-us' }
  | { kind: 'publisher'; publisherId: number }
  | { kind: 'series'; seriesId: number }
  | { kind: 'issue'; issueId: number };

export type ReimportRunOptions = {
  dryRun?: boolean;
  scope?: ReimportScope;
  enableTargetDeFastPath?: boolean;
  collectDetails?: boolean;
  sourceModels?: DbModels;
  targetModels?: DbModels;
};

type LiveCounters = {
  totalDeSeries: number;
  processedDeSeries: number;
  totalDeIssues: number;
  processedDeIssues: number;
  totalDeIssueDurationMs: number;
  totalUsIssueGroups: number;
  totalMappedUsIssues: number;
  processedUsIssues: number;
  processedUsIssueGroups: number;
  results: {
    shortbox: number;
    crawler: number;
    moved: number;
    manual: number;
  };
};

type SummaryCounters = {
  reasons: {
    ok: number;
    notFound: number;
    storyCountMismatch: number;
    storyCountMismatchSubset: number;
    storyTitleMismatch: number;
    crawlFailed: number;
  };
  storyCountDirections: {
    crawlerHasMoreStories: number;
    crawlerHasFewerStories: number;
  };
};

type StoryMapping = {
  sourceStoryId: number;
  sourceStoryNumber: number;
  sourceStoryTitle: string;
  crawledStoryIndex: number;
  crawledStoryNumber: number;
  crawledStoryTitle: string;
};

export type ReimportUsIssueResult = {
  id: number;
  label: string;
  result: 'shortbox' | 'crawler' | 'moved' | 'manual';
  status: 'ok' | 'check';
  reason:
    | 'ok'
    | 'target-existing'
    | 'not-found'
    | 'story-count-mismatch'
    | 'story-count-mismatch-subset'
    | 'story-title-mismatch'
    | 'crawl-failed';
  moved: boolean;
  shortboxStoryCount: number;
  crawledStoryCount: number | null;
  storyCountDirection?: 'crawler-has-more-stories' | 'crawler-has-fewer-stories';
  storyTitleSubset?: boolean;
  storyMappings?: StoryMapping[];
  unmatchedShortboxStoryTitles?: string[];
  unmatchedCrawledStoryTitles?: string[];
  requestedSeries: {
    title: string;
    volume: number;
  };
  crawledSeries?: {
    title: string;
    volume: number;
  };
  error?: string;
};

export type ReimportDeIssueResult = {
  id: number;
  label: string;
  status: 'ok' | 'check' | 'manual';
  linkedUsIssueIds: number[];
  usIssues: ReimportUsIssueResult[];
};

export type ReimportSeriesResult = {
  id: number;
  title: string;
  volume: number;
  publisherName: string;
  issues: ReimportDeIssueResult[];
};

export type ReimportReport = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  scope: ReimportScope;
  summary: {
    totalDeSeries: number;
    totalDeIssues: number;
    totalMappedUsIssues: number;
    results: {
      shortbox: number;
      crawler: number;
      moved: number;
      manual: number;
    };
    reasons: {
      ok: number;
      notFound: number;
      storyCountMismatch: number;
      storyCountMismatchSubset: number;
      storyTitleMismatch: number;
      crawlFailed: number;
    };
    storyCountDirections: {
      crawlerHasMoreStories: number;
      crawlerHasFewerStories: number;
    };
  };
  series: ReimportSeriesResult[];
};

type SeriesWithPublisher = {
  id: number;
  title: string;
  volume: number;
  genre?: string;
  publisher?: {
    id: number;
    name: string;
    original: boolean;
  };
};

type DeIssueWithStories = {
  id: number;
  number: string;
  format: string;
  variant: string;
  fk_series: number;
  series?: {
    id: number;
    title: string;
    volume: number;
    genre?: string;
    publisher?: {
      id: number;
      name: string;
      original: boolean;
    };
  };
  stories?: Array<{
    id: number;
    number: number;
    title?: string;
    fk_parent: number | null;
  }>;
};

type UsStoryRow = {
  id: number;
  fk_issue: number;
  fk_reprint: number | null;
};

type SourceUsIssue = {
  id: number;
  number: string;
  series?: {
    id: number;
    title: string;
    volume: number;
    genre?: string;
    publisher?: {
      id: number;
      name: string;
      original: boolean;
    };
  };
  stories?: Array<{
    id: number;
    number: number;
    title?: string;
    fk_reprint: number | null;
  }>;
};

type LoadedIndividual = {
  id: number;
  name: string;
  issue_individual?: { type?: string };
  cover_individual?: { type?: string };
  story_individual?: { type?: string };
};

type LoadedAppearance = {
  id: number;
  name: string;
  type: string;
  story_appearance?: { role?: string };
};

type LoadedCover = {
  id: number;
  url: string;
  number: number;
  addinfo?: string;
  individuals?: LoadedIndividual[];
};

type LoadedStory = {
  id: number;
  title: string;
  number: number;
  onlyapp?: boolean;
  firstapp?: boolean;
  otheronlytb?: boolean;
  onlytb?: boolean;
  onlyoneprint?: boolean;
  collected?: boolean;
  collectedmultipletimes?: boolean;
  addinfo?: string;
  part?: string;
  fk_parent?: number | null;
  fk_reprint?: number | null;
  individuals?: LoadedIndividual[];
  appearances?: LoadedAppearance[];
};

class MissingTargetParentStoryMappingError extends Error {
  public readonly missingSourceStoryIds: number[];
  public readonly deIssueLabel: string;

  constructor(deIssueLabel: string, missingSourceStoryIds: number[]) {
    const uniqueIds = Array.from(new Set(missingSourceStoryIds.map(toInt).filter((id) => id > 0)));
    super(
      `Missing target parent story mapping for DE issue ${deIssueLabel}${
        uniqueIds.length > 0 ? ` (source stories ${uniqueIds.join(', ')})` : ''
      }`,
    );
    this.name = 'MissingTargetParentStoryMappingError';
    this.deIssueLabel = deIssueLabel;
    this.missingSourceStoryIds = uniqueIds;
  }
}

type LoadedIssueGraph = {
  id: number;
  title: string;
  number: string;
  format: string;
  variant: string;
  releasedate: string;
  legacy_number: string;
  pages: number;
  price: number;
  currency: string;
  verified: boolean;
  collected: boolean;
  comicguideid: string | number | null;
  isbn: string;
  limitation: string | number | null;
  addinfo: string;
  series?: SeriesWithPublisher;
  stories?: LoadedStory[];
  covers?: LoadedCover[];
  individuals?: LoadedIndividual[];
  arcs?: Array<{ id: number; title: string; type: string }>;
};

type SourceParentStoryLookup = {
  id: number;
  number: number;
  title: string;
  issue?: {
    number: string;
    variant: string;
    series?: {
      title: string;
      volume: number;
      publisher?: {
        name: string;
        original: boolean;
      };
    };
  };
};

type TargetIssueWithStories = {
  id: number;
  number: string;
  variant: string;
  stories?: Array<{
    id: number;
    number: number;
    title: string;
  }>;
};

type EvaluatedUsIssue = {
  report: ReimportUsIssueResult;
  sourceIssue: SourceUsIssue;
  crawledIssue?: CrawledIssue;
};

type EvaluationCache = Map<number, Promise<EvaluatedUsIssue>>;

const defaultScope: ReimportScope = { kind: 'all-us' };
const SERIES_BATCH_SIZE = 25;

const normalizeDryRun = (options?: ReimportRunOptions): boolean => {
  if (typeof options?.dryRun === 'boolean') return options.dryRun;
  return true;
};

const normalizeTargetDeFastPath = (options?: ReimportRunOptions): boolean =>
  !normalizeDryRun(options);

const normalizeCollectDetails = (
  options: ReimportRunOptions | undefined,
  dryRun: boolean,
): boolean => {
  if (typeof options?.collectDetails === 'boolean') return options.collectDetails;
  return true;
};

const normalizeString = (value: unknown): string => String(value || '').trim();
const normalizeLower = (value: unknown): string => normalizeString(value).toLowerCase();
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_DATE_DOT_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const LEGACY_DATE_DASH_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const LEGACY_DATE_SHORT_YEAR_PATTERN = /^(\d{2})-(\d{2})-(\d{2})$/;
const RELEASE_DATE_TIMEZONE = 'Europe/Berlin';
const RELEASE_DATE_FALLBACK = '1970-01-01';
const NUMERIC_STRING_PATTERN = /^\d+$/;
const ARC_TITLE_MAX_LENGTH = 255;
const US_EVALUATION_CONCURRENCY = 3;
const SOURCE_SERIES_ATTRIBUTES = [
  'id',
  'title',
  'startyear',
  'endyear',
  'volume',
  'addinfo',
  'fk_publisher',
];

const truncateString = (value: unknown, maxLength: number): string => {
  const normalized = normalizeString(value);
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength);
};

const quoteSqlIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

const resolveSeriesTableReference = (
  targetModels: DbModels,
): { schema: string; table: string } | null => {
  const seriesModel = targetModels.Series as unknown as { getTableName?: () => unknown };
  if (!seriesModel || typeof seriesModel.getTableName !== 'function') return null;
  const tableName = seriesModel.getTableName();
  if (typeof tableName === 'string') {
    return { schema: 'shortbox', table: normalizeString(tableName) || 'series' };
  }
  const resolved = tableName as { schema?: string; tableName?: string };
  return {
    schema: normalizeString(resolved.schema) || 'shortbox',
    table: normalizeString(resolved.tableName) || 'series',
  };
};

const ensureTargetSeriesGenreColumn = async (targetModels: DbModels): Promise<void> => {
  if (typeof targetModels?.sequelize?.query !== 'function') return;
  const tableRef = resolveSeriesTableReference(targetModels);
  if (!tableRef) return;
  const qualifiedTable = `${quoteSqlIdentifier(tableRef.schema)}.${quoteSqlIdentifier(tableRef.table)}`;
  await targetModels.sequelize.query(
    `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS genre VARCHAR(255) NOT NULL DEFAULT ''`,
  );
};

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> => {
  const limit = Math.max(1, Math.trunc(concurrency));
  const results: Output[] = [];

  for (let offset = 0; offset < items.length; offset += limit) {
    const chunk = items.slice(offset, offset + limit);
    const chunkResults = await Promise.all(
      chunk.map((item, index) => mapper(item, offset + index)),
    );
    results.push(...chunkResults);
  }

  return results;
};

const normalizeReleaseDateForDb = (value: unknown): string => {
  const toFallback = (): string => RELEASE_DATE_FALLBACK;

  const toIsoDate = (date: Date): string => {
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: RELEASE_DATE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = dateParts.find((part) => part.type === 'year')?.value;
    const month = dateParts.find((part) => part.type === 'month')?.value;
    const day = dateParts.find((part) => part.type === 'day')?.value;

    return year && month && day ? `${year}-${month}-${day}` : '';
  };

  const fromDateParts = (year: number, month: number, day: number): string => {
    const parsed = new Date(year, month - 1, day);
    const isValid =
      parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
    if (!isValid) return toFallback();
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const normalizeTwoDigitYear = (year: number): number => {
    const now = new Date();
    const currentYearTwoDigits = now.getFullYear() % 100;
    return year <= currentYearTwoDigits + 1 ? 2000 + year : 1900 + year;
  };

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? toFallback() : toIsoDate(value);
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? toFallback() : toIsoDate(parsed);
  }

  const trimmed = normalizeString(value);
  if (!trimmed) return toFallback();
  if (normalizeLower(trimmed) === 'invalid date') return toFallback();

  const isoMatch = trimmed.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    return fromDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dotMatch = trimmed.match(LEGACY_DATE_DOT_PATTERN);
  if (dotMatch) {
    return fromDateParts(Number(dotMatch[3]), Number(dotMatch[2]), Number(dotMatch[1]));
  }

  const dashMatch = trimmed.match(LEGACY_DATE_DASH_PATTERN);
  if (dashMatch) {
    return fromDateParts(Number(dashMatch[3]), Number(dashMatch[2]), Number(dashMatch[1]));
  }

  const shortYearMatch = trimmed.match(LEGACY_DATE_SHORT_YEAR_PATTERN);
  if (shortYearMatch) {
    const year = normalizeTwoDigitYear(Number(shortYearMatch[3]));
    return fromDateParts(year, Number(shortYearMatch[2]), Number(shortYearMatch[1]));
  }

  const directDate = new Date(trimmed);
  return Number.isNaN(directDate.getTime()) ? toFallback() : toIsoDate(directDate);
};

const isValidIsoDateOnly = (value: string): boolean => {
  const match = normalizeString(value).match(ISO_DATE_PATTERN);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  );
};

const coerceReleaseDateForDb = (value: unknown): string => {
  const normalized = normalizeReleaseDateForDb(value);
  return isValidIsoDateOnly(normalized) ? normalized : RELEASE_DATE_FALLBACK;
};

const normalizeNullableBigInt = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  const trimmed = normalizeString(value);
  if (!trimmed || !NUMERIC_STRING_PATTERN.test(trimmed)) return null;

  return Number(trimmed);
};

const toInt = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const issueLabel = (issue: {
  series?: { title?: string; volume?: number };
  number?: string;
}): string =>
  `${normalizeString(issue.series?.title)} (Vol. ${toInt(issue.series?.volume)}) #${normalizeString(issue.number)}`;

const formatReimportCounter = (label: string, current: number, total?: number): string => {
  if (!total || total <= 0) return `${label} ${current}`;
  return `${label} ${current}/${total} (${((current / total) * 100).toFixed(1)}%)`;
};

const formatApproxDuration = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatIssueDuration = (durationMs: number): string => {
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return formatApproxDuration(durationMs);
};

const centerLabel = (value: string, width: number): string => {
  const normalized = normalizeString(value).toUpperCase();
  if (normalized.length >= width) return normalized;
  const totalPadding = width - normalized.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${normalized}${' '.repeat(rightPadding)}`;
};

const formatLogScope = (value: 'issue' | 'us'): string => `[reimport][${value}]`.padEnd(17, ' ');

const formatPrimaryLabel = (value: string): string => centerLabel(value, 8);

const formatStatusLabel = (value: string): string => centerLabel(value, 6);

const formatIssueStatus = (usIssues: ReimportUsIssueResult[]): ReimportDeIssueResult['status'] => {
  if (usIssues.some((issue) => issue.result === 'manual')) return 'manual';
  if (usIssues.some((issue) => issue.status === 'check')) return 'check';
  return 'ok';
};

const formatIssueLog = (
  action: 'start' | 'skip' | 'done' | 'manual',
  status: 'info' | ReimportDeIssueResult['status'],
  label: string,
  extras: string[] = [],
): string => {
  const actionLabel =
    action === 'start'
      ? 'START'
      : action === 'skip'
        ? 'SKIP'
        : action === 'done'
          ? 'DONE'
          : 'MANUAL';
  const parts = [
    formatLogScope('issue'),
    formatPrimaryLabel(actionLabel),
    formatStatusLabel(status),
    label,
  ];
  return [...parts, ...extras].join(' | ');
};

const formatUsIssueLog = (result: ReimportUsIssueResult): string => {
  const parts = [
    formatLogScope('us'),
    formatPrimaryLabel(result.result),
    formatStatusLabel(result.status),
    result.label,
  ];

  if (result.reason !== 'ok') parts.push(`reason=${result.reason}`);
  if (result.moved) parts.push('moved=yes');
  if (result.shortboxStoryCount > 0 || result.crawledStoryCount != null) {
    parts.push(`stories=${result.shortboxStoryCount}->${result.crawledStoryCount ?? '-'}`);
  }
  if (result.storyCountDirection) parts.push(`direction=${result.storyCountDirection}`);
  if (result.unmatchedShortboxStoryTitles?.length) {
    parts.push(`missing=${result.unmatchedShortboxStoryTitles.join('|')}`);
  }
  if (result.unmatchedCrawledStoryTitles?.length) {
    parts.push(`extra=${result.unmatchedCrawledStoryTitles.join('|')}`);
  }

  return parts.join(' | ');
};

const shouldUseSourceIssuePayload = (result: ReimportUsIssueResult): boolean =>
  result.reason === 'not-found' ||
  (result.result === 'manual' && result.reason === 'story-count-mismatch');

const shouldSkipUsIssuePersistence = (result: ReimportUsIssueResult): boolean =>
  result.reason === 'target-existing';

const normalizeStoryTitle = (value: unknown): string =>
  normalizeLower(
    normalizeString(value)
      .replace(/[“”„‟]/g, '"')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/^["']+|["']+$/g, '')
      .replace(/\s+/g, ' '),
  );

const STORY_PLACEHOLDER_TITLE_PATTERN = /^\d+(st|nd|rd|th)\s+(story|profile)$/i;

const normalizeStoryTitleForStorage = (value: unknown): string => {
  const normalized = normalizeString(value);
  if (!normalized) return 'Untitled';
  return normalized || 'Untitled';
};

const normalizeStoryTitleForComparison = (value: unknown): string => {
  const normalized = normalizeString(value);
  if (!normalized || STORY_PLACEHOLDER_TITLE_PATTERN.test(normalized)) return 'Untitled';
  return normalized || 'Untitled';
};

const normalizeStoryTitleForMatch = (value: unknown): string =>
  normalizeStoryTitle(normalizeStoryTitleForComparison(value));

const storyTitlesLooselyMatch = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeString(left);
  const normalizedRight = normalizeString(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
};

type StoryWithNumberAndTitle = {
  number?: number;
  title?: string;
};

type StoryNumberGroup<T extends StoryWithNumberAndTitle> = {
  number: number;
  representative: T;
  representativeIndex: number;
  members: Array<{ story: T; index: number }>;
};

const hasMeaningfulStoryTitle = (value: unknown): boolean =>
  normalizeStoryTitleForComparison(value) !== 'Untitled';

const shouldReplaceStoryRepresentative = <T extends StoryWithNumberAndTitle>(
  currentRepresentative: T,
  candidate: T,
): boolean => {
  const currentHasMeaningfulTitle = hasMeaningfulStoryTitle(currentRepresentative.title);
  const candidateHasMeaningfulTitle = hasMeaningfulStoryTitle(candidate.title);
  if (candidateHasMeaningfulTitle !== currentHasMeaningfulTitle) return candidateHasMeaningfulTitle;

  const currentTitle = normalizeString(currentRepresentative.title);
  const candidateTitle = normalizeString(candidate.title);
  return Boolean(candidateTitle) && !currentTitle;
};

const groupStoriesByNumber = <T extends StoryWithNumberAndTitle>(
  stories: T[] | undefined,
): Array<StoryNumberGroup<T>> => {
  if (!Array.isArray(stories)) return [];

  const groupsByKey = new Map<string, StoryNumberGroup<T>>();
  const groups: Array<StoryNumberGroup<T>> = [];

  stories.forEach((story, index) => {
    const number = toInt(story.number);
    const key = number > 0 ? `number:${number}` : `index:${index}`;
    const existingGroup = groupsByKey.get(key);

    if (!existingGroup) {
      const createdGroup: StoryNumberGroup<T> = {
        number,
        representative: story,
        representativeIndex: index,
        members: [{ story, index }],
      };
      groupsByKey.set(key, createdGroup);
      groups.push(createdGroup);
      return;
    }

    existingGroup.members.push({ story, index });
    if (shouldReplaceStoryRepresentative(existingGroup.representative, story)) {
      existingGroup.representative = story;
      existingGroup.representativeIndex = index;
    }
  });

  return groups;
};

const collectRepresentativeStoriesByNumber = <T extends StoryWithNumberAndTitle>(
  stories: T[] | undefined,
): T[] => groupStoriesByNumber(stories).map((group) => group.representative);

const collectNormalizedStoryTitles = (stories: Array<{ title?: string }> | undefined): string[] =>
  Array.isArray(stories)
    ? stories
        .map((story) => normalizeStoryTitleForMatch(story.title))
        .filter((title) => title.length > 0)
    : [];

const buildStoryMappings = (
  sourceStories: Array<{ id?: number; number?: number; title?: string }> | undefined,
  crawledStories: Array<{ number?: number; title?: string }> | undefined,
): StoryMapping[] => {
  if (!Array.isArray(sourceStories) || !Array.isArray(crawledStories)) return [];

  const sourceGroups = groupStoriesByNumber(sourceStories);
  const crawledGroups = groupStoriesByNumber(crawledStories);

  const available = crawledGroups.map((group) => ({
    used: false,
    index: group.representativeIndex,
    normalizedTitle: normalizeStoryTitleForMatch(group.representative.title),
    number: toInt(group.number),
    title: normalizeStoryTitleForStorage(group.representative.title),
  }));

  const mappings: StoryMapping[] = [];
  for (const sourceGroup of sourceGroups) {
    const representativeStory = sourceGroup.representative;
    const normalizedSourceTitle = normalizeStoryTitleForMatch(representativeStory.title);
    const sourceNumber = toInt(sourceGroup.number);
    const sourceDbTitle = normalizeStoryTitleForComparison(representativeStory.title);
    const hasMeaningfulTitle = Boolean(normalizedSourceTitle) && sourceDbTitle !== 'Untitled';
    if (!hasMeaningfulTitle && sourceNumber <= 0) continue;

    const exactMatches = hasMeaningfulTitle
      ? available.filter(
          (candidate) => !candidate.used && candidate.normalizedTitle === normalizedSourceTitle,
        )
      : [];
    const looseMatches =
      exactMatches.length === 0 && hasMeaningfulTitle
        ? available.filter(
            (candidate) =>
              !candidate.used &&
              storyTitlesLooselyMatch(candidate.normalizedTitle, normalizedSourceTitle),
          )
        : [];
    const numberMatches =
      exactMatches.length === 0 &&
      looseMatches.length === 0 &&
      !hasMeaningfulTitle &&
      sourceNumber > 0
        ? available.filter((candidate) => !candidate.used && candidate.number === sourceNumber)
        : [];

    const match =
      exactMatches.find((candidate) => candidate.number === sourceNumber) ||
      (exactMatches.length === 1 ? exactMatches[0] : null) ||
      looseMatches.find((candidate) => candidate.number === sourceNumber) ||
      (looseMatches.length === 1 ? looseMatches[0] : null) ||
      (numberMatches.length === 1 ? numberMatches[0] : null) ||
      (sourceNumber > 0
        ? available.find((candidate) => !candidate.used && candidate.number === sourceNumber) ||
          null
        : null);
    if (!match) continue;

    match.used = true;
    for (const sourceMember of sourceGroup.members) {
      mappings.push({
        sourceStoryId: toInt(sourceMember.story.id),
        sourceStoryNumber: toInt(sourceMember.story.number),
        sourceStoryTitle: normalizeString(sourceMember.story.title),
        crawledStoryIndex: match.index,
        crawledStoryNumber: match.number,
        crawledStoryTitle: match.title,
      });
    }
  }

  return mappings;
};

const subtractTitleMultiset = (
  availableTitles: string[],
  requiredTitles: string[],
  options?: { loose?: boolean },
): string[] => {
  const loose = Boolean(options?.loose);
  const remaining = availableTitles.slice();
  const missing: string[] = [];

  for (const title of requiredTitles) {
    const exactIndex = remaining.findIndex((candidate) => candidate === title);
    if (exactIndex >= 0) {
      remaining.splice(exactIndex, 1);
      continue;
    }

    if (loose) {
      const looseIndex = remaining.findIndex((candidate) =>
        storyTitlesLooselyMatch(candidate, title),
      );
      if (looseIndex >= 0) {
        remaining.splice(looseIndex, 1);
        continue;
      }
    }

    missing.push(title);
  }

  return missing;
};

const loadSeriesBatchForScope = async (
  sourceModels: DbModels,
  scope: ReimportScope,
  offset: number,
  limit: number,
): Promise<SeriesWithPublisher[]> => {
  if (scope.kind === 'series') {
    if (offset > 0) return [];
    return (await sourceModels.Series.findAll({
      where: { id: scope.seriesId },
      attributes: SOURCE_SERIES_ATTRIBUTES,
      include: [
        {
          model: sourceModels.Publisher,
          as: 'publisher',
          required: true,
          where: { original: false },
        },
      ],
    })) as unknown as SeriesWithPublisher[];
  }

  if (scope.kind === 'issue') {
    if (offset > 0) return [];
    const issue = (await sourceModels.Issue.findByPk(scope.issueId)) as unknown as {
      fk_series?: number | null;
    } | null;
    const seriesId = toInt(issue?.fk_series);
    if (!seriesId) return [];

    const series = (await sourceModels.Series.findByPk(seriesId, {
      attributes: SOURCE_SERIES_ATTRIBUTES,
      include: [
        {
          model: sourceModels.Publisher,
          as: 'publisher',
          required: true,
          where: { original: false },
        },
      ],
    })) as unknown as SeriesWithPublisher | null;
    return series ? [series] : [];
  }

  const where: Record<string, unknown> = {};
  const include = [
    {
      model: sourceModels.Publisher,
      as: 'publisher',
      required: true,
      where: { original: false, ...(scope.kind === 'publisher' ? { id: scope.publisherId } : {}) },
    },
  ];

  return (await sourceModels.Series.findAll({
    where,
    attributes: SOURCE_SERIES_ATTRIBUTES,
    include,
    order: [['id', 'ASC']],
    offset,
    limit,
  })) as unknown as SeriesWithPublisher[];
};

const loadDeIssuesForSeries = async (
  sourceModels: DbModels,
  seriesId: number,
): Promise<DeIssueWithStories[]> =>
  (await sourceModels.Issue.findAll({
    where: { fk_series: seriesId },
    include: [
      {
        model: sourceModels.Series,
        as: 'series',
        required: true,
        attributes: SOURCE_SERIES_ATTRIBUTES,
        include: [
          {
            model: sourceModels.Publisher,
            as: 'publisher',
            required: true,
            where: { original: false },
          },
        ],
      },
      {
        model: sourceModels.Story,
        as: 'stories',
        required: false,
        attributes: ['id', 'number', 'title', 'fk_parent'],
      },
    ],
    order: [
      ['number', 'ASC'],
      ['id', 'ASC'],
      [{ model: sourceModels.Story, as: 'stories' }, 'number', 'ASC'],
      [{ model: sourceModels.Story, as: 'stories' }, 'id', 'ASC'],
    ],
  })) as unknown as DeIssueWithStories[];

type TargetDeIssueSnapshot = {
  id: number;
  stories?: Array<{
    id: number;
    number: number;
    title?: string;
    fk_parent?: number | null;
  }>;
};

const loadTargetDeIssueSnapshot = async (
  targetModels: DbModels,
  deIssue: DeIssueWithStories,
): Promise<TargetDeIssueSnapshot | null> =>
  (
    await targetModels.Issue.findOne({
      where: {
        number: normalizeString(deIssue.number),
        format: normalizeString(deIssue.format),
        variant: normalizeString(deIssue.variant),
      },
      include: [
        {
          model: targetModels.Series,
          as: 'series',
          required: true,
          where: {
            title: normalizeString(deIssue.series?.title),
            volume: toInt(deIssue.series?.volume),
          },
          include: [
            {
              model: targetModels.Publisher,
              as: 'publisher',
              required: true,
              where: {
                name: normalizeString(deIssue.series?.publisher?.name),
                original: false,
              },
            },
          ],
        },
        {
          model: targetModels.Story,
          as: 'stories',
          required: false,
          attributes: ['id', 'number', 'title', 'fk_parent'],
        },
      ],
      order: [
        [{ model: targetModels.Story, as: 'stories' }, 'number', 'ASC'],
        [{ model: targetModels.Story, as: 'stories' }, 'id', 'ASC'],
      ],
    })
  )?.get({ plain: true }) as unknown as TargetDeIssueSnapshot | null;

const targetDeIssueLooksComplete = async (
  targetModels: DbModels,
  deIssue: DeIssueWithStories,
): Promise<boolean> => {
  if (!deIssue.series?.publisher || !deIssue.series) return false;

  const targetIssue = await loadTargetDeIssueSnapshot(targetModels, deIssue);
  if (!targetIssue) return false;

  const sourceStories = Array.isArray(deIssue.stories) ? deIssue.stories : [];
  const targetStories = Array.isArray(targetIssue.stories) ? targetIssue.stories : [];

  if (sourceStories.length !== targetStories.length) return false;

  const targetParentCountsByStoryNumber = new Map<number, number>();
  for (const targetStory of targetStories) {
    if (targetStory.fk_parent == null) continue;
    const storyNumber = toInt(targetStory.number);
    targetParentCountsByStoryNumber.set(
      storyNumber,
      (targetParentCountsByStoryNumber.get(storyNumber) || 0) + 1,
    );
  }

  for (const sourceStory of sourceStories) {
    if (sourceStory.fk_parent == null) continue;
    const storyNumber = toInt(sourceStory.number);
    const availableCount = targetParentCountsByStoryNumber.get(storyNumber) || 0;
    if (availableCount <= 0) return false;
    targetParentCountsByStoryNumber.set(storyNumber, availableCount - 1);
  }

  return true;
};

const countDeSeriesForScope = async (
  sourceModels: DbModels,
  scope: ReimportScope,
): Promise<number> => {
  if (scope.kind === 'series' || scope.kind === 'issue') return 1;

  const include = [
    {
      model: sourceModels.Publisher,
      as: 'publisher',
      required: true,
      where: { original: false, ...(scope.kind === 'publisher' ? { id: scope.publisherId } : {}) },
    },
  ];

  return sourceModels.Series.count({ include });
};

const countDeIssuesForScope = async (
  sourceModels: DbModels,
  scope: ReimportScope,
): Promise<number> => {
  if (scope.kind === 'issue') return 1;

  if (scope.kind === 'series') {
    return sourceModels.Issue.count({ where: { fk_series: scope.seriesId } });
  }

  return sourceModels.Issue.count({
    include: [
      {
        model: sourceModels.Series,
        as: 'series',
        required: true,
        attributes: [],
        include: [
          {
            model: sourceModels.Publisher,
            as: 'publisher',
            required: true,
            attributes: [],
            where: {
              original: false,
              ...(scope.kind === 'publisher' ? { id: scope.publisherId } : {}),
            },
          },
        ],
      },
    ],
  });
};

const countUsIssueGroupsForScope = async (sourceModels: DbModels): Promise<number> =>
  sourceModels.Issue.count({
    where: {
      [Op.or]: [{ variant: '' }, { variant: null }],
    },
    include: [
      {
        model: sourceModels.Series,
        as: 'series',
        required: true,
        attributes: [],
        include: [
          {
            model: sourceModels.Publisher,
            as: 'publisher',
            required: true,
            attributes: [],
            where: { original: true },
          },
        ],
      },
    ],
  });

const loadUsStoryClosure = async (
  sourceModels: DbModels,
  startStoryIds: number[],
): Promise<Map<number, UsStoryRow>> => {
  const storyMap = new Map<number, UsStoryRow>();
  const queue = Array.from(new Set(startStoryIds.map(toInt).filter((value) => value > 0)));

  while (queue.length > 0) {
    const frontier = queue.splice(0, 100);
    const rows = (await sourceModels.Story.findAll({
      where: { id: { [Op.in]: frontier } },
      attributes: ['id', 'fk_issue', 'fk_reprint'],
    })) as unknown as UsStoryRow[];

    for (const row of rows) {
      const id = toInt(row.id);
      if (!id || storyMap.has(id)) continue;
      const normalized: UsStoryRow = {
        id,
        fk_issue: toInt(row.fk_issue),
        fk_reprint: row.fk_reprint == null ? null : toInt(row.fk_reprint),
      };
      storyMap.set(id, normalized);
      if (normalized.fk_reprint && !storyMap.has(normalized.fk_reprint)) {
        queue.push(normalized.fk_reprint);
      }
    }
  }

  return storyMap;
};

const loadLinkedUsIssueIdsForDeIssue = async (
  sourceModels: DbModels,
  deIssue: DeIssueWithStories,
): Promise<{ rootUsStoryIds: number[]; usIssueIds: number[] }> => {
  const rootUsStoryIds = Array.from(
    new Set((deIssue.stories || []).map((story) => toInt(story.fk_parent)).filter((id) => id > 0)),
  );
  if (rootUsStoryIds.length === 0) {
    return { rootUsStoryIds, usIssueIds: [] };
  }

  const usStoryClosure = await loadUsStoryClosure(sourceModels, rootUsStoryIds);
  const usIssueIds = Array.from(
    new Set(
      [...usStoryClosure.values()].map((story) => toInt(story.fk_issue)).filter((id) => id > 0),
    ),
  ).sort((left, right) => left - right);

  return { rootUsStoryIds, usIssueIds };
};

const loadUsIssueGroupKeys = async (
  sourceModels: DbModels,
  usIssueIds: number[],
): Promise<Set<string>> => {
  const uniqueIssueIds = Array.from(new Set(usIssueIds.map(toInt).filter((id) => id > 0)));
  if (uniqueIssueIds.length === 0) return new Set<string>();

  const rows = (await sourceModels.Issue.findAll({
    where: { id: { [Op.in]: uniqueIssueIds } },
    attributes: ['id', 'number', 'fk_series'],
    raw: true,
  })) as unknown as Array<{ id: number; number: string; fk_series: number }>;

  const keys = new Set<string>();
  for (const row of rows) {
    const seriesId = toInt(row.fk_series);
    const issueNumber = normalizeString(row.number);
    if (!seriesId || !issueNumber) continue;
    keys.add(targetIssueGroupKey(seriesId, issueNumber));
  }
  return keys;
};

const loadSourceUsIssue = async (
  sourceModels: DbModels,
  issueId: number,
): Promise<SourceUsIssue | null> =>
  (await sourceModels.Issue.findByPk(issueId, {
    include: [
      {
        model: sourceModels.Series,
        as: 'series',
        required: true,
        attributes: SOURCE_SERIES_ATTRIBUTES,
        include: [{ model: sourceModels.Publisher, as: 'publisher', required: true }],
      },
      {
        model: sourceModels.Story,
        as: 'stories',
        required: false,
        attributes: ['id', 'number', 'title', 'fk_reprint'],
      },
    ],
    order: [[{ model: sourceModels.Story, as: 'stories' }, 'number', 'ASC']],
  })) as unknown as SourceUsIssue | null;

const loadIssueGraph = async (
  sourceModels: DbModels,
  issueId: number,
): Promise<LoadedIssueGraph | null> => {
  const issue = await sourceModels.Issue.findByPk(issueId, {
    include: [
      {
        model: sourceModels.Series,
        as: 'series',
        required: true,
        attributes: SOURCE_SERIES_ATTRIBUTES,
        include: [{ model: sourceModels.Publisher, as: 'publisher', required: true }],
      },
      {
        model: sourceModels.Story,
        as: 'stories',
        required: false,
        include: [
          {
            model: sourceModels.Individual,
            as: 'individuals',
            required: false,
            through: { attributes: ['type'] },
          },
          {
            model: sourceModels.Appearance,
            as: 'appearances',
            required: false,
            through: { attributes: ['role'] },
          },
        ],
      },
      {
        model: sourceModels.Cover,
        as: 'covers',
        required: false,
        include: [
          {
            model: sourceModels.Individual,
            as: 'individuals',
            required: false,
            through: { attributes: ['type'] },
          },
        ],
      },
      {
        model: sourceModels.Individual,
        as: 'individuals',
        required: false,
        through: { attributes: ['type'] },
      },
      {
        model: sourceModels.Arc,
        as: 'arcs',
        required: false,
      },
    ],
    order: [
      [{ model: sourceModels.Story, as: 'stories' }, 'number', 'ASC'],
      [{ model: sourceModels.Story, as: 'stories' }, 'id', 'ASC'],
      [{ model: sourceModels.Cover, as: 'covers' }, 'number', 'ASC'],
      [{ model: sourceModels.Cover, as: 'covers' }, 'id', 'ASC'],
    ],
  });

  if (!issue) return null;
  return issue.get({ plain: true }) as unknown as LoadedIssueGraph;
};

const loadIssueGroupByNumber = async (
  sourceModels: DbModels,
  seriesId: number,
  number: string,
): Promise<LoadedIssueGraph[]> => {
  const issues = await sourceModels.Issue.findAll({
    where: {
      fk_series: seriesId,
      number: normalizeString(number),
    },
    include: [
      {
        model: sourceModels.Series,
        as: 'series',
        required: true,
        attributes: SOURCE_SERIES_ATTRIBUTES,
        include: [{ model: sourceModels.Publisher, as: 'publisher', required: true }],
      },
      {
        model: sourceModels.Story,
        as: 'stories',
        required: false,
        include: [
          {
            model: sourceModels.Individual,
            as: 'individuals',
            required: false,
            through: { attributes: ['type'] },
          },
          {
            model: sourceModels.Appearance,
            as: 'appearances',
            required: false,
            through: { attributes: ['role'] },
          },
        ],
      },
      {
        model: sourceModels.Cover,
        as: 'covers',
        required: false,
        include: [
          {
            model: sourceModels.Individual,
            as: 'individuals',
            required: false,
            through: { attributes: ['type'] },
          },
        ],
      },
      {
        model: sourceModels.Individual,
        as: 'individuals',
        required: false,
        through: { attributes: ['type'] },
      },
      {
        model: sourceModels.Arc,
        as: 'arcs',
        required: false,
      },
    ],
    order: [
      ['variant', 'ASC'],
      ['id', 'ASC'],
      [{ model: sourceModels.Story, as: 'stories' }, 'number', 'ASC'],
      [{ model: sourceModels.Story, as: 'stories' }, 'id', 'ASC'],
      [{ model: sourceModels.Cover, as: 'covers' }, 'number', 'ASC'],
      [{ model: sourceModels.Cover, as: 'covers' }, 'id', 'ASC'],
    ],
  });

  if (!Array.isArray(issues)) return [];
  return issues.map((issue) =>
    typeof issue?.get === 'function'
      ? (issue.get({ plain: true }) as unknown as LoadedIssueGraph)
      : (issue as unknown as LoadedIssueGraph),
  );
};

const targetHasIssueGroup = async (
  targetModels: DbModels,
  targetIssueGroupPresenceCache: TargetIssueGroupPresenceCache,
  series: { title: string; volume: number; publisherName?: string },
  issueNumber: string,
): Promise<boolean> => {
  const cacheKey = targetIssueGroupPresenceCacheKey(series, issueNumber);
  const cached = targetIssueGroupPresenceCache.get(cacheKey);
  if (cached) return cached;

  const pending = targetModels.Issue.count({
    where: { number: normalizeString(issueNumber) },
    include: [
      {
        model: targetModels.Series,
        as: 'series',
        required: true,
        where: {
          title: normalizeString(series.title),
          volume: toInt(series.volume),
        },
        include: [
          {
            model: targetModels.Publisher,
            as: 'publisher',
            required: true,
            ...(series.publisherName
              ? { where: { name: normalizeString(series.publisherName) } }
              : {}),
          },
        ],
      },
    ],
  }).then((count) => count > 0);

  targetIssueGroupPresenceCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    targetIssueGroupPresenceCache.delete(cacheKey);
    throw error;
  }
};

const evaluateUsIssue = async (
  sourceModels: DbModels,
  issueId: number,
  crawler: MarvelCrawlerService,
  evaluationCache: EvaluationCache,
  targetIssueGroupPresenceCache?: TargetIssueGroupPresenceCache,
  targetModels?: DbModels | null,
): Promise<EvaluatedUsIssue> => {
  const cached = evaluationCache.get(issueId);
  if (cached) return cached;

  const pending = (async (): Promise<EvaluatedUsIssue> => {
    const sourceIssue = await loadSourceUsIssue(sourceModels, issueId);
    if (!sourceIssue?.series) {
      throw new Error(`Source US issue ${issueId} is missing series`);
    }

    const label = issueLabel(sourceIssue);
    const sourceStoriesForComparison = collectRepresentativeStoriesByNumber(sourceIssue.stories);
    const sourceStoryCount = sourceStoriesForComparison.length;
    const requestedSeries = {
      title: normalizeString(sourceIssue.series.title),
      volume: toInt(sourceIssue.series.volume),
    };

    if (
      targetModels &&
      (await targetHasIssueGroup(
        targetModels,
        targetIssueGroupPresenceCache || createTargetIssueGroupPresenceCache(),
        {
          title: requestedSeries.title,
          volume: requestedSeries.volume,
          publisherName: sourceIssue.series.publisher?.name,
        },
        sourceIssue.number,
      ))
    ) {
      return {
        sourceIssue,
        report: {
          id: issueId,
          label,
          result: 'shortbox',
          status: 'ok',
          reason: 'target-existing',
          moved: false,
          shortboxStoryCount: sourceStoryCount,
          crawledStoryCount: null,
          requestedSeries,
        },
      };
    }

    try {
      const crawled = await crawler.crawlIssue(
        requestedSeries.title,
        requestedSeries.volume,
        sourceIssue.number,
      );
      const crawledStoriesForComparison = collectRepresentativeStoriesByNumber(crawled.stories);
      const crawledStoryCount = crawledStoriesForComparison.length;
      const crawledSeries = {
        title: normalizeString(crawled.series?.title) || requestedSeries.title,
        volume: toInt(crawled.series?.volume) || requestedSeries.volume,
      };
      const moved =
        normalizeLower(crawledSeries.title) !== normalizeLower(requestedSeries.title) ||
        crawledSeries.volume !== requestedSeries.volume;
      const crawlResult: ReimportUsIssueResult['result'] = moved ? 'moved' : 'crawler';
      const shortboxStoryTitles = collectNormalizedStoryTitles(sourceStoriesForComparison);
      const crawledStoryTitles = collectNormalizedStoryTitles(crawledStoriesForComparison);
      const storyMappings = buildStoryMappings(sourceIssue.stories, crawled.stories);
      const hasComparableTitleSets =
        sourceStoryCount > 0 &&
        crawledStoryCount > 0 &&
        shortboxStoryTitles.length === sourceStoryCount &&
        crawledStoryTitles.length === crawledStoryCount;

      if (crawledStoryCount < sourceStoryCount) {
        const unmatchedShortboxStoryTitles = hasComparableTitleSets
          ? subtractTitleMultiset(crawledStoryTitles, shortboxStoryTitles)
          : shortboxStoryTitles;
        return {
          sourceIssue,
          crawledIssue: crawled,
          report: {
            id: issueId,
            label,
            result: 'manual',
            status: 'check',
            reason: 'story-count-mismatch',
            moved,
            shortboxStoryCount: sourceStoryCount,
            crawledStoryCount,
            storyCountDirection: 'crawler-has-fewer-stories',
            storyTitleSubset: shortboxStoryTitles.length > 0 ? false : undefined,
            storyMappings,
            unmatchedShortboxStoryTitles:
              unmatchedShortboxStoryTitles.length > 0 ? unmatchedShortboxStoryTitles : undefined,
            requestedSeries,
            crawledSeries,
          },
        };
      }

      if (crawledStoryCount > sourceStoryCount) {
        const unmatchedShortboxStoryTitles = hasComparableTitleSets
          ? subtractTitleMultiset(crawledStoryTitles, shortboxStoryTitles)
          : shortboxStoryTitles;
        const unmatchedShortboxStoryTitlesLoose = hasComparableTitleSets
          ? subtractTitleMultiset(crawledStoryTitles, shortboxStoryTitles, { loose: true })
          : shortboxStoryTitles;
        const storyTitleSubset =
          shortboxStoryTitles.length > 0 && unmatchedShortboxStoryTitles.length === 0;
        const looseStoryTitleSubset =
          !storyTitleSubset &&
          shortboxStoryTitles.length > 0 &&
          unmatchedShortboxStoryTitlesLoose.length === 0;

        return {
          sourceIssue,
          crawledIssue: crawled,
          report: {
            id: issueId,
            label,
            result: crawlResult,
            status: storyTitleSubset && !moved ? 'ok' : 'check',
            reason:
              storyTitleSubset || looseStoryTitleSubset
                ? 'story-count-mismatch-subset'
                : 'story-count-mismatch',
            moved,
            shortboxStoryCount: sourceStoryCount,
            crawledStoryCount,
            storyCountDirection: 'crawler-has-more-stories',
            storyTitleSubset:
              shortboxStoryTitles.length > 0
                ? storyTitleSubset || looseStoryTitleSubset
                : undefined,
            storyMappings,
            unmatchedShortboxStoryTitles:
              storyTitleSubset || looseStoryTitleSubset
                ? undefined
                : unmatchedShortboxStoryTitles.length > 0
                  ? unmatchedShortboxStoryTitles
                  : undefined,
            requestedSeries,
            crawledSeries,
          },
        };
      }

      if (sourceStoryCount > 0 && crawledStoryCount > 0) {
        const unmatchedShortboxStoryTitles = hasComparableTitleSets
          ? subtractTitleMultiset(crawledStoryTitles, shortboxStoryTitles)
          : shortboxStoryTitles;
        const unmatchedCrawledStoryTitles = hasComparableTitleSets
          ? subtractTitleMultiset(shortboxStoryTitles, crawledStoryTitles)
          : crawledStoryTitles;

        if (
          !hasComparableTitleSets ||
          unmatchedShortboxStoryTitles.length > 0 ||
          unmatchedCrawledStoryTitles.length > 0
        ) {
          return {
            sourceIssue,
            crawledIssue: crawled,
            report: {
              id: issueId,
              label,
              result: crawlResult,
              status: 'check',
              reason: 'story-title-mismatch',
              moved,
              shortboxStoryCount: sourceStoryCount,
              crawledStoryCount,
              storyMappings,
              requestedSeries,
              crawledSeries,
              unmatchedShortboxStoryTitles:
                unmatchedShortboxStoryTitles.length > 0 ? unmatchedShortboxStoryTitles : undefined,
              unmatchedCrawledStoryTitles:
                unmatchedCrawledStoryTitles.length > 0 ? unmatchedCrawledStoryTitles : undefined,
            },
          };
        }
      }

      return {
        sourceIssue,
        crawledIssue: crawled,
        report: {
          id: issueId,
          label,
          result: crawlResult,
          status: moved ? 'check' : 'ok',
          reason: 'ok',
          moved,
          shortboxStoryCount: sourceStoryCount,
          crawledStoryCount,
          requestedSeries,
          crawledSeries,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sourceIssue,
        report: {
          id: issueId,
          label,
          result: 'shortbox',
          status: 'ok',
          reason: message.includes('No parse.text') ? 'not-found' : 'crawl-failed',
          moved: false,
          shortboxStoryCount: sourceStoryCount,
          crawledStoryCount: null,
          requestedSeries,
          error: message,
        },
      };
    }
  })();

  evaluationCache.set(issueId, pending);
  return pending;
};

const targetStoryRefKey = (
  seriesTitle: string,
  volume: number,
  issueNumber: string,
  storyNumber: number,
) =>
  `${normalizeLower(seriesTitle)}::${toInt(volume)}::${normalizeLower(issueNumber)}::${toInt(storyNumber)}`;

const targetIssueGroupKey = (seriesId: number, number: string) =>
  `${toInt(seriesId)}::${normalizeString(number)}`;

type TargetEntityCache = {
  publishers: Map<string, Promise<any>>;
  series: Map<string, Promise<any>>;
  individuals: Map<string, Promise<any>>;
  appearances: Map<string, Promise<any>>;
  arcs: Map<string, Promise<any>>;
};

type TargetIssueGroupPresenceCache = Map<string, Promise<boolean>>;

const createTargetEntityCache = (): TargetEntityCache => ({
  publishers: new Map<string, Promise<any>>(),
  series: new Map<string, Promise<any>>(),
  individuals: new Map<string, Promise<any>>(),
  appearances: new Map<string, Promise<any>>(),
  arcs: new Map<string, Promise<any>>(),
});

const targetPublisherCacheKey = (name: string) => normalizeString(name);

const targetSeriesCacheKey = (publisherId: number, title: string, volume: number) =>
  `${toInt(publisherId)}::${normalizeString(title)}::${toInt(volume)}`;

const targetIndividualCacheKey = (name: string) => normalizeString(name);

const targetAppearanceCacheKey = (name: string, type: string) =>
  `${normalizeString(name)}::${normalizeString(type)}`;

const targetArcCacheKey = (title: string, type: string) =>
  `${truncateString(title, ARC_TITLE_MAX_LENGTH)}::${normalizeString(type)}`;

const primeEntityCache = (cache: Map<string, Promise<any>>, cacheKey: string, entity: any) => {
  if (!cacheKey) return;
  cache.set(cacheKey, Promise.resolve(entity));
};

const createTargetIssueGroupPresenceCache = (): TargetIssueGroupPresenceCache =>
  new Map<string, Promise<boolean>>();

const targetIssueGroupPresenceCacheKey = (
  series: { title: string; volume: number; publisherName?: string },
  issueNumber: string,
) =>
  [
    normalizeString(series.title),
    toInt(series.volume),
    normalizeString(series.publisherName),
    normalizeString(issueNumber),
  ].join('::');

const primeTargetIssueGroupPresenceCache = (
  cache: TargetIssueGroupPresenceCache,
  series: { title: string; volume: number; publisherName?: string },
  issueNumber: string,
  exists: boolean,
) => {
  cache.set(
    targetIssueGroupPresenceCacheKey(series, issueNumber),
    Promise.resolve(Boolean(exists)),
  );
};

const syncIssueScalars = async (
  targetModels: DbModels,
  issueData: Partial<LoadedIssueGraph> & {
    number: string;
    variant: string;
    fk_series: number;
  },
) => {
  const defaults = {
    title: normalizeString(issueData.title),
    number: normalizeString(issueData.number),
    format: normalizeString(issueData.format),
    variant: normalizeString(issueData.variant),
    releasedate: coerceReleaseDateForDb(issueData.releasedate),
    legacy_number: normalizeString(issueData.legacy_number),
    pages: toInt(issueData.pages),
    price: Number(issueData.price || 0),
    currency: normalizeString(issueData.currency),
    verified: Boolean(issueData.verified),
    collected: Boolean(issueData.collected),
    comicguideid: normalizeNullableBigInt(issueData.comicguideid) ?? 0,
    isbn: normalizeString(issueData.isbn),
    limitation: normalizeNullableBigInt(issueData.limitation) ?? 0,
    addinfo: normalizeString(issueData.addinfo),
    fk_series: toInt(issueData.fk_series),
  };

  const [issue] = await targetModels.Issue.findOrCreate({
    where: {
      number: defaults.number,
      format: defaults.format,
      variant: defaults.variant,
      fk_series: defaults.fk_series,
    },
    defaults,
  });

  issue.title = defaults.title;
  issue.format = defaults.format;
  issue.releasedate = defaults.releasedate;
  issue.legacy_number = defaults.legacy_number;
  issue.pages = defaults.pages;
  issue.price = defaults.price;
  issue.currency = defaults.currency;
  issue.verified = defaults.verified;
  issue.collected = defaults.collected;
  (issue as unknown as { comicguideid: number | null }).comicguideid = defaults.comicguideid;
  issue.isbn = defaults.isbn;
  (issue as unknown as { limitation: number | null }).limitation = defaults.limitation;
  issue.addinfo = defaults.addinfo;
  issue.fk_series = defaults.fk_series;
  await issue.save();

  return issue;
};

const findOrCreateTargetPublisher = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  sourcePublisher: {
    name?: string;
    original?: boolean;
    addinfo?: string;
    startyear?: number;
    endyear?: number | null;
  },
) => {
  const name = normalizeString(sourcePublisher.name);
  const cacheKey = targetPublisherCacheKey(name);
  let publisherPromise = targetEntityCache.publishers.get(cacheKey);
  if (!publisherPromise) {
    publisherPromise = targetModels.Publisher.findOrCreate({
      where: { name },
      defaults: {
        name,
        original: Boolean(sourcePublisher.original),
        addinfo: normalizeString(sourcePublisher.addinfo),
        startyear: toInt(sourcePublisher.startyear),
        endyear: sourcePublisher.endyear == null ? 0 : toInt(sourcePublisher.endyear),
      },
    }).then(([publisher]) => publisher);
    targetEntityCache.publishers.set(cacheKey, publisherPromise);
  }

  let publisher;
  try {
    publisher = await publisherPromise;
  } catch (error) {
    targetEntityCache.publishers.delete(cacheKey);
    throw error;
  }

  publisher.original = Boolean(sourcePublisher.original);
  publisher.addinfo = normalizeString(sourcePublisher.addinfo);
  publisher.startyear = toInt(sourcePublisher.startyear);
  publisher.endyear = sourcePublisher.endyear == null ? 0 : toInt(sourcePublisher.endyear);
  await publisher.save();
  return publisher;
};

const findOrCreateTargetSeries = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  publisherId: number,
  sourceSeries: {
    title?: string;
    volume?: number;
    startyear?: number;
    endyear?: number | null;
    genre?: string;
    addinfo?: string;
  },
) => {
  const title = normalizeString(sourceSeries.title);
  const volume = toInt(sourceSeries.volume);
  const cacheKey = targetSeriesCacheKey(publisherId, title, volume);
  let seriesPromise = targetEntityCache.series.get(cacheKey);
  if (!seriesPromise) {
    seriesPromise = targetModels.Series.findOrCreate({
      where: { title, volume, fk_publisher: publisherId },
      defaults: {
        title,
        volume,
        startyear: toInt(sourceSeries.startyear),
        endyear: sourceSeries.endyear == null ? 0 : toInt(sourceSeries.endyear),
        genre: normalizeString(sourceSeries.genre),
        addinfo: normalizeString(sourceSeries.addinfo),
        fk_publisher: publisherId,
      },
    }).then(([series]) => series);
    targetEntityCache.series.set(cacheKey, seriesPromise);
  }

  let series;
  try {
    series = await seriesPromise;
  } catch (error) {
    targetEntityCache.series.delete(cacheKey);
    throw error;
  }

  series.startyear = toInt(sourceSeries.startyear);
  series.endyear = sourceSeries.endyear == null ? 0 : toInt(sourceSeries.endyear);
  series.genre = normalizeString(sourceSeries.genre);
  series.addinfo = normalizeString(sourceSeries.addinfo);
  series.fk_publisher = publisherId;
  await series.save();
  return series;
};

const findOrCreateTargetIndividual = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  name: string,
) => {
  const normalizedName = normalizeString(name);
  const cacheKey = targetIndividualCacheKey(normalizedName);
  let individualPromise = targetEntityCache.individuals.get(cacheKey);
  if (!individualPromise) {
    individualPromise = targetModels.Individual.findOrCreate({
      where: { name: normalizedName },
      defaults: { name: normalizedName },
    }).then(([individual]) => individual);
    targetEntityCache.individuals.set(cacheKey, individualPromise);
  }
  try {
    return await individualPromise;
  } catch (error) {
    targetEntityCache.individuals.delete(cacheKey);
    throw error;
  }
};

const findOrCreateTargetAppearance = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  name: string,
  type: string,
) => {
  const normalizedName = normalizeString(name);
  const normalizedType = normalizeString(type);
  const cacheKey = targetAppearanceCacheKey(normalizedName, normalizedType);
  let appearancePromise = targetEntityCache.appearances.get(cacheKey);
  if (!appearancePromise) {
    appearancePromise = targetModels.Appearance.findOrCreate({
      where: { name: normalizedName, type: normalizedType },
      defaults: { name: normalizedName, type: normalizedType },
    }).then(([appearance]) => appearance);
    targetEntityCache.appearances.set(cacheKey, appearancePromise);
  }
  try {
    return await appearancePromise;
  } catch (error) {
    targetEntityCache.appearances.delete(cacheKey);
    throw error;
  }
};

const findOrCreateTargetArc = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  title: string,
  type: string,
) => {
  const normalizedTitle = truncateString(title, ARC_TITLE_MAX_LENGTH);
  const normalizedType = normalizeString(type);
  const cacheKey = targetArcCacheKey(normalizedTitle, normalizedType);
  let arcPromise = targetEntityCache.arcs.get(cacheKey);
  if (!arcPromise) {
    arcPromise = targetModels.Arc.findOrCreate({
      where: { title: normalizedTitle, type: normalizedType },
      defaults: { title: normalizedTitle, type: normalizedType },
    }).then(([arc]) => arc);
    targetEntityCache.arcs.set(cacheKey, arcPromise);
  }
  try {
    return await arcPromise;
  } catch (error) {
    targetEntityCache.arcs.delete(cacheKey);
    throw error;
  }
};

type TargetStoryPersistenceContext = {
  storiesById: Map<number, any>;
  storiesByNumber: Map<number, any[]>;
  storyIndividualKeysByStoryId: Map<number, Set<string>>;
  storyAppearanceKeysByStoryId: Map<number, Set<string>>;
};

const targetStoryIndividualLinkKey = (individualId: number, type: string) =>
  `${toInt(individualId)}::${normalizeString(type)}`;

const targetStoryAppearanceLinkKey = (appearanceId: number, role: string) =>
  `${toInt(appearanceId)}::${normalizeString(role)}`;

const rememberTargetStoryInPersistenceContext = (
  context: TargetStoryPersistenceContext,
  targetEntityCache: TargetEntityCache,
  targetStory: any,
) => {
  const storyId = toInt(targetStory?.id);
  if (!storyId || context.storiesById.has(storyId)) return;

  context.storiesById.set(storyId, targetStory);

  const storyNumber = toInt(targetStory?.number);
  const storiesForNumber = context.storiesByNumber.get(storyNumber) || [];
  storiesForNumber.push(targetStory);
  storiesForNumber.sort((left, right) => toInt(left?.id) - toInt(right?.id));
  context.storiesByNumber.set(storyNumber, storiesForNumber);

  const individualKeys = new Set<string>();
  for (const individual of Array.isArray(targetStory?.individuals) ? targetStory.individuals : []) {
    const individualId = toInt(individual?.id);
    const type = normalizeString(individual?.story_individual?.type);
    const name = normalizeString(individual?.name);
    if (individualId > 0 && type) {
      individualKeys.add(targetStoryIndividualLinkKey(individualId, type));
    }
    if (name && individualId > 0) {
      primeEntityCache(targetEntityCache.individuals, targetIndividualCacheKey(name), individual);
    }
  }
  context.storyIndividualKeysByStoryId.set(storyId, individualKeys);

  const appearanceKeys = new Set<string>();
  for (const appearance of Array.isArray(targetStory?.appearances) ? targetStory.appearances : []) {
    const appearanceId = toInt(appearance?.id);
    const role = normalizeString(appearance?.story_appearance?.role);
    const name = normalizeString(appearance?.name);
    const type = normalizeString(appearance?.type);
    if (appearanceId > 0 && type) {
      appearanceKeys.add(targetStoryAppearanceLinkKey(appearanceId, role));
    }
    if (name && type && appearanceId > 0) {
      primeEntityCache(
        targetEntityCache.appearances,
        targetAppearanceCacheKey(name, type),
        appearance,
      );
    }
  }
  context.storyAppearanceKeysByStoryId.set(storyId, appearanceKeys);
};

const loadTargetStoryPersistenceContext = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  issueId: number,
): Promise<TargetStoryPersistenceContext> => {
  const existingStories = await targetModels.Story.findAll({
    where: { fk_issue: issueId },
    include: [
      {
        model: targetModels.Individual,
        as: 'individuals',
        required: false,
        through: { attributes: ['type'] },
      },
      {
        model: targetModels.Appearance,
        as: 'appearances',
        required: false,
        through: { attributes: ['role'] },
      },
    ],
    order: [
      ['number', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  const context: TargetStoryPersistenceContext = {
    storiesById: new Map<number, any>(),
    storiesByNumber: new Map<number, any[]>(),
    storyIndividualKeysByStoryId: new Map<number, Set<string>>(),
    storyAppearanceKeysByStoryId: new Map<number, Set<string>>(),
  };

  for (const targetStory of existingStories) {
    rememberTargetStoryInPersistenceContext(context, targetEntityCache, targetStory);
  }

  return context;
};

const getOrLoadTargetIndividualCached = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  name: string,
) => {
  return findOrCreateTargetIndividual(targetModels, targetEntityCache, name);
};

const getOrLoadTargetAppearanceCached = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  name: string,
  type: string,
) => {
  return findOrCreateTargetAppearance(targetModels, targetEntityCache, name, type);
};

const syncIssueIndividuals = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  issueId: number,
  individuals: LoadedIndividual[] | CrawledIndividual[] | undefined,
) => {
  if (!Array.isArray(individuals)) return;
  for (const entry of individuals) {
    const type =
      normalizeString((entry as LoadedIndividual).issue_individual?.type) ||
      normalizeString((entry as CrawledIndividual).type);
    const name = normalizeString(entry.name);
    if (!name || !type) continue;
    const individual = await findOrCreateTargetIndividual(targetModels, targetEntityCache, name);
    await targetModels.Issue_Individual.findOrCreate({
      where: { fk_issue: issueId, fk_individual: individual.id, type },
      defaults: { fk_issue: issueId, fk_individual: individual.id, type },
    });
  }
};

const syncCoverIndividuals = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  coverId: number,
  individuals: LoadedIndividual[] | CrawledIndividual[] | undefined,
) => {
  if (!Array.isArray(individuals)) return;
  for (const entry of individuals) {
    const type =
      normalizeString((entry as LoadedIndividual).cover_individual?.type) ||
      normalizeString((entry as CrawledIndividual).type);
    const name = normalizeString(entry.name);
    if (!name || !type) continue;
    const individual = await findOrCreateTargetIndividual(targetModels, targetEntityCache, name);
    await targetModels.Cover_Individual.findOrCreate({
      where: { fk_cover: coverId, fk_individual: individual.id, type },
      defaults: { fk_cover: coverId, fk_individual: individual.id, type },
    });
  }
};

const syncStoryIndividuals = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  context: TargetStoryPersistenceContext,
  storyId: number,
  individuals: LoadedIndividual[] | CrawledIndividual[] | undefined,
) => {
  if (!Array.isArray(individuals)) return;
  const existingLinks = context.storyIndividualKeysByStoryId.get(storyId) || new Set<string>();
  context.storyIndividualKeysByStoryId.set(storyId, existingLinks);

  for (const entry of individuals) {
    const type =
      normalizeString((entry as LoadedIndividual).story_individual?.type) ||
      normalizeString((entry as CrawledIndividual).type);
    const name = normalizeString(entry.name);
    if (!name || !type) continue;
    const individual = await getOrLoadTargetIndividualCached(targetModels, targetEntityCache, name);
    const linkKey = targetStoryIndividualLinkKey(individual.id, type);
    if (existingLinks.has(linkKey)) continue;

    await targetModels.Story_Individual.create({
      fk_story: storyId,
      fk_individual: individual.id,
      type,
    });
    existingLinks.add(linkKey);
  }
};

const syncStoryAppearances = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  context: TargetStoryPersistenceContext,
  storyId: number,
  appearances: LoadedAppearance[] | CrawledAppearance[] | undefined,
) => {
  if (!Array.isArray(appearances)) return;
  const existingLinks = context.storyAppearanceKeysByStoryId.get(storyId) || new Set<string>();
  context.storyAppearanceKeysByStoryId.set(storyId, existingLinks);

  for (const entry of appearances) {
    const name = normalizeString(entry.name);
    const type = normalizeString(entry.type);
    const role =
      normalizeString((entry as LoadedAppearance).story_appearance?.role) ||
      normalizeString((entry as CrawledAppearance).role);
    if (!name || !type) continue;
    const appearance = await getOrLoadTargetAppearanceCached(
      targetModels,
      targetEntityCache,
      name,
      type,
    );
    const linkKey = targetStoryAppearanceLinkKey(appearance.id, role);
    if (existingLinks.has(linkKey)) continue;

    await targetModels.Story_Appearance.create({
      fk_story: storyId,
      fk_appearance: appearance.id,
      role,
    });
    existingLinks.add(linkKey);
  }
};

const syncIssueArcs = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  issueId: number,
  arcs: Array<{ title: string; type: string }> | undefined,
) => {
  if (!Array.isArray(arcs)) return;
  for (const arcEntry of arcs) {
    const title = normalizeString(arcEntry.title);
    const type = normalizeString(arcEntry.type);
    if (!title || !type) continue;
    const arc = await findOrCreateTargetArc(targetModels, targetEntityCache, title, type);
    await targetModels.Issue_Arc.findOrCreate({
      where: { fk_issue: issueId, fk_arc: arc.id },
      defaults: { fk_issue: issueId, fk_arc: arc.id },
    });
  }
};

const matchExistingStory = (
  context: TargetStoryPersistenceContext,
  storyNumber: number,
  title: string,
) => {
  const candidates = context.storiesByNumber.get(toInt(storyNumber)) || [];

  const wantedTitle = normalizeStoryTitleForMatch(title);
  const normalizedMatch = candidates.find(
    (candidate) => normalizeStoryTitleForMatch(candidate.title) === wantedTitle,
  );
  if (normalizedMatch) return normalizedMatch;

  const exactDbTitle = normalizeStoryTitleForStorage(title);
  return candidates.find((candidate) => normalizeString(candidate.title) === exactDbTitle) || null;
};

const matchStoryFromIssueStories = (
  stories: Array<{ id: number; number: number; title: string }> | undefined,
  storyNumber: number,
  title: string,
): number | null => {
  const sourceNumber = toInt(storyNumber);
  const normalizedTitle = normalizeStoryTitleForMatch(title);
  const exactDbTitle = normalizeStoryTitleForStorage(title);

  const byNumber = Array.isArray(stories)
    ? stories.filter((story) => toInt(story.number) === sourceNumber)
    : [];
  const numberScoped = byNumber.length > 0 ? byNumber : Array.isArray(stories) ? stories : [];

  const normalizedMatch = numberScoped.find(
    (candidate) => normalizeStoryTitleForMatch(candidate.title) === normalizedTitle,
  );
  if (normalizedMatch) return toInt(normalizedMatch.id);

  const exactMatch = numberScoped.find(
    (candidate) => normalizeString(candidate.title) === exactDbTitle,
  );
  if (exactMatch) return toInt(exactMatch.id);

  if (numberScoped.length === 1) {
    return toInt(numberScoped[0].id);
  }

  return null;
};

const loadSourceParentStoryLookups = async (
  sourceModels: DbModels,
  sourceStoryIds: number[],
): Promise<SourceParentStoryLookup[]> => {
  const uniqueSourceStoryIds = Array.from(
    new Set(sourceStoryIds.map(toInt).filter((id) => id > 0)),
  );
  if (uniqueSourceStoryIds.length === 0) return [];

  const rows = await sourceModels.Story.findAll({
    where: { id: { [Op.in]: uniqueSourceStoryIds } },
    attributes: ['id', 'number', 'title'],
    include: [
      {
        model: sourceModels.Issue,
        as: 'issue',
        required: true,
        attributes: ['number', 'variant'],
        include: [
          {
            model: sourceModels.Series,
            as: 'series',
            required: true,
            attributes: ['title', 'volume'],
            include: [
              {
                model: sourceModels.Publisher,
                as: 'publisher',
                required: true,
                attributes: ['name', 'original'],
              },
            ],
          },
        ],
      },
    ],
  });

  return rows.map((row) =>
    typeof row?.get === 'function'
      ? (row.get({ plain: true }) as unknown as SourceParentStoryLookup)
      : (row as unknown as SourceParentStoryLookup),
  );
};

const loadTargetIssueWithStoriesForSourceParentStory = async (
  targetModels: DbModels,
  sourceStory: SourceParentStoryLookup,
): Promise<TargetIssueWithStories | null> => {
  const issueNumber = normalizeString(sourceStory.issue?.number);
  const issueVariant = normalizeString(sourceStory.issue?.variant);
  const seriesTitle = normalizeString(sourceStory.issue?.series?.title);
  const seriesVolume = toInt(sourceStory.issue?.series?.volume);
  const publisherName = normalizeString(sourceStory.issue?.series?.publisher?.name);
  const publisherOriginal = Boolean(sourceStory.issue?.series?.publisher?.original);

  if (!issueNumber || !seriesTitle || !seriesVolume || !publisherName) return null;

  const findByVariant = async (variant: string): Promise<TargetIssueWithStories | null> => {
    const issue = (await targetModels.Issue.findOne({
      where: {
        number: issueNumber,
        variant: normalizeString(variant),
      },
      include: [
        {
          model: targetModels.Series,
          as: 'series',
          required: true,
          where: {
            title: seriesTitle,
            volume: seriesVolume,
          },
          include: [
            {
              model: targetModels.Publisher,
              as: 'publisher',
              required: true,
              where: {
                name: publisherName,
                original: publisherOriginal,
              },
            },
          ],
        },
        {
          model: targetModels.Story,
          as: 'stories',
          required: false,
          attributes: ['id', 'number', 'title'],
        },
      ],
      order: [[{ model: targetModels.Story, as: 'stories' }, 'number', 'ASC']],
    })) as unknown as { get?: (options?: { plain?: boolean }) => unknown } | null;

    if (!issue) return null;
    return typeof issue.get === 'function'
      ? (issue.get({ plain: true }) as unknown as TargetIssueWithStories)
      : (issue as unknown as TargetIssueWithStories);
  };

  const exactVariantMatch = await findByVariant(issueVariant);
  if (exactVariantMatch) return exactVariantMatch;
  if (!issueVariant) return null;
  return await findByVariant('');
};

const hydrateTargetParentStoryMappingsFromTarget = async (
  sourceModels: DbModels,
  targetModels: DbModels,
  sourceStoryToTargetStoryId: Map<number, number>,
  sourceStoryIds: number[],
) => {
  const unresolvedSourceStoryIds = Array.from(
    new Set(
      sourceStoryIds
        .map(toInt)
        .filter(
          (sourceStoryId) => sourceStoryId > 0 && !sourceStoryToTargetStoryId.has(sourceStoryId),
        ),
    ),
  );
  if (unresolvedSourceStoryIds.length === 0) return;

  const sourceStories = await loadSourceParentStoryLookups(sourceModels, unresolvedSourceStoryIds);
  const targetIssueCache = new Map<string, Promise<TargetIssueWithStories | null>>();

  for (const sourceStory of sourceStories) {
    const sourceStoryId = toInt(sourceStory.id);
    if (!sourceStoryId || sourceStoryToTargetStoryId.has(sourceStoryId)) continue;

    const issueKey = [
      normalizeString(sourceStory.issue?.series?.publisher?.name),
      sourceStory.issue?.series?.publisher?.original ? 'us' : 'de',
      normalizeString(sourceStory.issue?.series?.title),
      toInt(sourceStory.issue?.series?.volume),
      normalizeString(sourceStory.issue?.number),
      normalizeString(sourceStory.issue?.variant),
    ].join('::');

    let targetIssuePromise = targetIssueCache.get(issueKey);
    if (!targetIssuePromise) {
      targetIssuePromise = loadTargetIssueWithStoriesForSourceParentStory(
        targetModels,
        sourceStory,
      );
      targetIssueCache.set(issueKey, targetIssuePromise);
    }

    const targetIssue = await targetIssuePromise;
    if (!targetIssue) continue;

    const matchedTargetStoryId = matchStoryFromIssueStories(
      targetIssue.stories,
      toInt(sourceStory.number),
      sourceStory.title,
    );
    if (!matchedTargetStoryId) continue;

    sourceStoryToTargetStoryId.set(sourceStoryId, matchedTargetStoryId);
  }
};

const buildImplicitStoryMappings = (
  sourceStories: Array<{ id?: number; number?: number; title?: string }> | undefined,
  crawledStories: Array<{ number?: number; title?: string }> | undefined,
): StoryMapping[] => {
  const byTitle = buildStoryMappings(sourceStories, crawledStories);
  if (byTitle.length > 0) return byTitle;
  if (!Array.isArray(sourceStories) || !Array.isArray(crawledStories)) return [];

  return sourceStories
    .slice()
    .sort((left, right) => toInt(left.number) - toInt(right.number))
    .map((sourceStory, index) => {
      const crawledStory = crawledStories[index];
      if (!crawledStory) return null;
      return {
        sourceStoryId: toInt(sourceStory.id),
        sourceStoryNumber: toInt(sourceStory.number),
        sourceStoryTitle: normalizeString(sourceStory.title),
        crawledStoryIndex: index,
        crawledStoryNumber: toInt(crawledStory.number),
        crawledStoryTitle: normalizeString(crawledStory.title),
      };
    })
    .filter((entry): entry is StoryMapping => entry != null);
};

const findCrawledStoryIndexForSourceStory = (
  sourceStory: { number?: number; title?: string },
  crawledStories: Array<{ number?: number; title?: string }> | undefined,
): number | null => {
  if (!Array.isArray(crawledStories) || crawledStories.length === 0) return null;

  const sourceNumber = toInt(sourceStory.number);
  const sourceTitle = normalizeStoryTitleForMatch(sourceStory.title);
  const sourceDbTitle = normalizeStoryTitleForComparison(sourceStory.title);

  if (sourceTitle && sourceDbTitle !== 'Untitled') {
    const titleMatches = crawledStories
      .map((story, index) => ({
        index,
        number: toInt(story.number),
        title: normalizeStoryTitleForMatch(story.title),
      }))
      .filter((candidate) => candidate.title === sourceTitle);

    const titleAndNumberMatch = titleMatches.find((candidate) => candidate.number === sourceNumber);
    if (titleAndNumberMatch) return titleAndNumberMatch.index;
    if (titleMatches.length === 1) return titleMatches[0].index;

    const looseTitleMatches = crawledStories
      .map((story, index) => ({
        index,
        number: toInt(story.number),
        title: normalizeStoryTitleForMatch(story.title),
      }))
      .filter((candidate) => storyTitlesLooselyMatch(candidate.title, sourceTitle));

    const looseTitleAndNumberMatch = looseTitleMatches.find(
      (candidate) => candidate.number === sourceNumber,
    );
    if (looseTitleAndNumberMatch) return looseTitleAndNumberMatch.index;
    if (looseTitleMatches.length === 1) return looseTitleMatches[0].index;
    return null;
  }

  if (sourceNumber > 0) {
    const numberMatches = crawledStories
      .map((story, index) => ({
        index,
        number: toInt(story.number),
      }))
      .filter((candidate) => candidate.number === sourceNumber);
    if (numberMatches.length === 1) return numberMatches[0].index;
  }

  return null;
};

const buildStoryMappingsFromSourceStories = (
  sourceStories: Array<{ id?: number; number?: number; title?: string }> | undefined,
  crawledStories: Array<{ number?: number; title?: string }> | undefined,
): StoryMapping[] => buildStoryMappings(sourceStories, crawledStories);

const buildIssueGroupStoryMappings = (
  sourceIssues: LoadedIssueGraph[],
  crawledStories: Array<{ number?: number; title?: string }> | undefined,
): StoryMapping[] => {
  if (!Array.isArray(crawledStories) || crawledStories.length === 0) return [];

  const mappings: StoryMapping[] = [];
  for (const sourceIssue of sourceIssues) {
    mappings.push(...buildStoryMappingsFromSourceStories(sourceIssue.stories, crawledStories));
  }

  return mappings;
};

const loadResolvableSourceStoryIdsForEvaluatedIssue = async (
  sourceModels: DbModels,
  evaluated: EvaluatedUsIssue,
): Promise<Set<number>> => {
  if (evaluated.report.reason === 'crawl-failed') {
    return new Set();
  }

  if (evaluated.report.result === 'crawler' || evaluated.report.result === 'moved') {
    if (evaluated.report.reason === 'ok' && Array.isArray(evaluated.sourceIssue.stories)) {
      return new Set(
        evaluated.sourceIssue.stories
          .map((story) => toInt(story.id))
          .filter((sourceStoryId) => sourceStoryId > 0),
      );
    }

    if (
      Array.isArray(evaluated.report.storyMappings) &&
      evaluated.report.storyMappings.length > 0
    ) {
      return new Set(
        evaluated.report.storyMappings
          .map((mapping) => toInt(mapping.sourceStoryId))
          .filter((sourceStoryId) => sourceStoryId > 0),
      );
    }

    const sourceSeriesId = toInt(evaluated.sourceIssue.series?.id);
    if (!sourceSeriesId) return new Set();
    const groupIssues = await loadIssueGroupByNumber(
      sourceModels,
      sourceSeriesId,
      evaluated.sourceIssue.number,
    );
    if (groupIssues.length === 0) return new Set();
    const storyMappings = buildIssueGroupStoryMappings(
      groupIssues,
      evaluated.crawledIssue?.stories,
    );

    return new Set(
      storyMappings
        .map((mapping) => toInt(mapping.sourceStoryId))
        .filter((sourceStoryId) => sourceStoryId > 0),
    );
  }

  if (Array.isArray(evaluated.sourceIssue.stories) && evaluated.sourceIssue.stories.length > 0) {
    return new Set(
      evaluated.sourceIssue.stories
        .map((story) => toInt(story.id))
        .filter((storyId) => storyId > 0),
    );
  }

  const sourceSeriesId = toInt(evaluated.sourceIssue.series?.id);
  if (!sourceSeriesId) return new Set();
  const groupIssues = await loadIssueGroupByNumber(
    sourceModels,
    sourceSeriesId,
    evaluated.sourceIssue.number,
  );
  return new Set(
    groupIssues.flatMap((issue) =>
      (issue.stories || []).map((story) => toInt(story.id)).filter((storyId) => storyId > 0),
    ),
  );
};

const findMissingDeParentStoryIds = async (
  sourceModels: DbModels,
  deIssue: DeIssueWithStories,
  evaluatedUsIssues: EvaluatedUsIssue[],
  sourceStoryToTargetStoryId: Map<number, number>,
): Promise<number[]> => {
  const requiredParentStoryIds = Array.from(
    new Set(
      (deIssue.stories || [])
        .map((story) => toInt(story.fk_parent))
        .filter((storyId) => storyId > 0),
    ),
  );
  if (requiredParentStoryIds.length === 0) return [];

  const resolvableParentStoryIds = new Set<number>(sourceStoryToTargetStoryId.keys());

  for (const evaluated of evaluatedUsIssues) {
    const sourceStoryIds = await loadResolvableSourceStoryIdsForEvaluatedIssue(
      sourceModels,
      evaluated,
    );
    for (const sourceStoryId of sourceStoryIds) {
      resolvableParentStoryIds.add(sourceStoryId);
    }
  }

  return requiredParentStoryIds.filter((storyId) => !resolvableParentStoryIds.has(storyId));
};

const findOrCreateCover = async (
  targetModels: DbModels,
  issueId: number,
  number: number,
  url: string,
  addinfo: string,
) => {
  const [cover] = await targetModels.Cover.findOrCreate({
    where: {
      fk_issue: issueId,
      fk_parent: null,
      number: toInt(number),
    },
    defaults: {
      fk_issue: issueId,
      fk_parent: null,
      number: toInt(number),
      url: normalizeString(url),
      addinfo: normalizeString(addinfo),
    },
  });
  cover.url = normalizeString(url);
  cover.addinfo = normalizeString(addinfo);
  await cover.save();
  return cover;
};

const loadOrCreateTargetIssueGroupContext = async (
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  sourcePublisher: {
    name?: string;
    original?: boolean;
    addinfo?: string;
    startyear?: number;
    endyear?: number | null;
  },
  sourceSeries: {
    title?: string;
    volume?: number;
    startyear?: number;
    endyear?: number | null;
    genre?: string;
    addinfo?: string;
  },
) => {
  const targetPublisher = await findOrCreateTargetPublisher(
    targetModels,
    targetEntityCache,
    sourcePublisher,
  );
  const targetSeries = await findOrCreateTargetSeries(
    targetModels,
    targetEntityCache,
    targetPublisher.id,
    sourceSeries,
  );
  return { targetPublisher, targetSeries };
};

const persistSourceUsIssueGroup = async (
  sourceModels: DbModels,
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  targetIssueGroupPresenceCache: TargetIssueGroupPresenceCache,
  evaluated: EvaluatedUsIssue,
  sourceStoryToTargetStoryId: Map<number, number>,
  pendingReprintLinks: Array<{ targetStoryId: number; sourceReprintStoryId: number }>,
  targetStoryRefIndex: Map<string, number>,
): Promise<void> => {
  const sourceSeriesId = toInt(evaluated.sourceIssue.series?.id);
  const groupIssues = await loadIssueGroupByNumber(
    sourceModels,
    sourceSeriesId,
    evaluated.sourceIssue.number,
  );
  if (groupIssues.length === 0) {
    throw new Error(`Could not load source US issue group for ${evaluated.report.label}`);
  }

  const { targetSeries } = await loadOrCreateTargetIssueGroupContext(
    targetModels,
    targetEntityCache,
    groupIssues[0].series?.publisher || {},
    groupIssues[0].series || {},
  );
  primeTargetIssueGroupPresenceCache(
    targetIssueGroupPresenceCache,
    {
      title: normalizeString(groupIssues[0].series?.title),
      volume: toInt(groupIssues[0].series?.volume),
      publisherName: groupIssues[0].series?.publisher?.name,
    },
    evaluated.sourceIssue.number,
    true,
  );

  const createdStories: Array<{ targetStoryId: number; sourceReprintStoryId?: number }> = [];

  for (const sourceIssue of groupIssues) {
    const targetIssue = await syncIssueScalars(targetModels, {
      ...sourceIssue,
      fk_series: targetSeries.id,
    });
    const targetStoryContext = await loadTargetStoryPersistenceContext(
      targetModels,
      targetEntityCache,
      targetIssue.id,
    );

    await syncIssueIndividuals(
      targetModels,
      targetEntityCache,
      targetIssue.id,
      sourceIssue.individuals,
    );
    await syncIssueArcs(targetModels, targetEntityCache, targetIssue.id, sourceIssue.arcs);

    for (const cover of sourceIssue.covers || []) {
      const targetCover = await findOrCreateCover(
        targetModels,
        targetIssue.id,
        toInt(cover.number),
        normalizeString(cover.url),
        normalizeString(cover.addinfo),
      );
      await syncCoverIndividuals(
        targetModels,
        targetEntityCache,
        targetCover.id,
        cover.individuals,
      );
    }

    for (const story of sourceIssue.stories || []) {
      const existing = matchExistingStory(targetStoryContext, toInt(story.number), story.title);
      const targetStory =
        existing ||
        (await targetModels.Story.create({
          fk_issue: targetIssue.id,
          number: toInt(story.number),
          title: normalizeStoryTitleForStorage(story.title),
          onlyapp: Boolean(story.onlyapp),
          firstapp: Boolean(story.firstapp),
          otheronlytb: Boolean(story.otheronlytb),
          onlytb: Boolean(story.onlytb),
          onlyoneprint: Boolean(story.onlyoneprint),
          collected: Boolean(story.collected),
          collectedmultipletimes: Boolean(story.collectedmultipletimes),
          addinfo: normalizeString(story.addinfo),
          part: normalizeString(story.part),
        }));
      rememberTargetStoryInPersistenceContext(targetStoryContext, targetEntityCache, targetStory);

      targetStory.onlyapp = Boolean(story.onlyapp);
      targetStory.firstapp = Boolean(story.firstapp);
      targetStory.otheronlytb = Boolean(story.otheronlytb);
      targetStory.onlytb = Boolean(story.onlytb);
      targetStory.onlyoneprint = Boolean(story.onlyoneprint);
      targetStory.collected = Boolean(story.collected);
      targetStory.collectedmultipletimes = Boolean(story.collectedmultipletimes);
      targetStory.title = normalizeStoryTitleForStorage(story.title);
      targetStory.addinfo = normalizeString(story.addinfo);
      targetStory.part = normalizeString(story.part);
      await targetStory.save();

      sourceStoryToTargetStoryId.set(toInt(story.id), targetStory.id);
      targetStoryRefIndex.set(
        targetStoryRefKey(
          normalizeString(sourceIssue.series?.title),
          toInt(sourceIssue.series?.volume),
          sourceIssue.number,
          toInt(story.number),
        ),
        targetStory.id,
      );
      createdStories.push({
        targetStoryId: targetStory.id,
        sourceReprintStoryId: story.fk_reprint == null ? undefined : toInt(story.fk_reprint),
      });

      await syncStoryIndividuals(
        targetModels,
        targetEntityCache,
        targetStoryContext,
        targetStory.id,
        story.individuals,
      );
      await syncStoryAppearances(
        targetModels,
        targetEntityCache,
        targetStoryContext,
        targetStory.id,
        story.appearances,
      );
    }
  }

  for (const createdStory of createdStories) {
    if (!createdStory.sourceReprintStoryId) continue;
    const mappedTargetReprintId = sourceStoryToTargetStoryId.get(createdStory.sourceReprintStoryId);
    if (mappedTargetReprintId) {
      await targetModels.Story.update(
        { fk_reprint: mappedTargetReprintId },
        { where: { id: createdStory.targetStoryId } },
      );
      continue;
    }
    if (createdStory.sourceReprintStoryId) {
      pendingReprintLinks.push({
        targetStoryId: createdStory.targetStoryId,
        sourceReprintStoryId: createdStory.sourceReprintStoryId,
      });
    }
  }
};

const persistCrawledUsIssueGroup = async (
  sourceModels: DbModels,
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  targetIssueGroupPresenceCache: TargetIssueGroupPresenceCache,
  evaluated: EvaluatedUsIssue,
  sourceStoryToTargetStoryId: Map<number, number>,
  pendingCrawledReprints: Array<{
    targetStoryId: number;
    seriesTitle: string;
    volume: number;
    issueNumber: string;
    storyNumber?: number;
  }>,
  targetStoryRefIndex: Map<string, number>,
): Promise<void> => {
  if (!evaluated.crawledIssue) {
    throw new Error(`Missing crawled issue payload for ${evaluated.report.label}`);
  }

  const crawledIssue = evaluated.crawledIssue;
  const series = crawledIssue.series || {
    title: evaluated.report.requestedSeries.title,
    volume: evaluated.report.requestedSeries.volume,
    startyear: 0,
    endyear: 0,
    genre: '',
    publisher: { name: 'Marvel Comics' },
  };
  const { targetSeries } = await loadOrCreateTargetIssueGroupContext(
    targetModels,
    targetEntityCache,
    {
      name: series.publisher?.name || 'Marvel Comics',
      original: true,
      addinfo: '',
      startyear: 0,
      endyear: 0,
    },
    {
      title: series.title,
      volume: series.volume,
      startyear: series.startyear,
      endyear: series.endyear,
      genre: series.genre,
      addinfo: '',
    },
  );
  primeTargetIssueGroupPresenceCache(
    targetIssueGroupPresenceCache,
    {
      title: normalizeString(series.title),
      volume: toInt(series.volume),
      publisherName: series.publisher?.name || 'Marvel Comics',
    },
    normalizeString(crawledIssue.number || evaluated.sourceIssue.number),
    true,
  );

  const mainIssue = await syncIssueScalars(targetModels, {
    title: '',
    number: normalizeString(crawledIssue.number || evaluated.sourceIssue.number),
    format: normalizeString(crawledIssue.format) || 'Heft',
    variant: '',
    releasedate: normalizeString(crawledIssue.releasedate),
    legacy_number: normalizeString(crawledIssue.legacyNumber),
    pages: 0,
    price: Number(crawledIssue.price || 0),
    currency: normalizeString(crawledIssue.currency),
    verified: false,
    collected: false,
    comicguideid: '0',
    isbn: '',
    limitation: '0',
    addinfo: '',
    fk_series: targetSeries.id,
  });

  await syncIssueIndividuals(
    targetModels,
    targetEntityCache,
    mainIssue.id,
    crawledIssue.individuals,
  );
  await syncIssueArcs(targetModels, targetEntityCache, mainIssue.id, crawledIssue.arcs);

  if (crawledIssue.cover) {
    const targetCover = await findOrCreateCover(
      targetModels,
      mainIssue.id,
      toInt(crawledIssue.cover.number),
      normalizeString(crawledIssue.cover.url),
      '',
    );
    await syncCoverIndividuals(
      targetModels,
      targetEntityCache,
      targetCover.id,
      crawledIssue.cover.individuals,
    );
  }

  const persistedCrawledStoryIdsByIndex = new Map<number, number>();
  const targetStoryContext = await loadTargetStoryPersistenceContext(
    targetModels,
    targetEntityCache,
    mainIssue.id,
  );
  for (const [index, story] of (crawledIssue.stories || []).entries()) {
    const existing = matchExistingStory(targetStoryContext, toInt(story.number), story.title);
    const targetStory =
      existing ||
      (await targetModels.Story.create({
        fk_issue: mainIssue.id,
        number: toInt(story.number),
        title: normalizeStoryTitleForStorage(story.title),
        addinfo: normalizeString(story.addinfo),
        part: normalizeString(story.part),
      }));
    rememberTargetStoryInPersistenceContext(targetStoryContext, targetEntityCache, targetStory);

    targetStory.title = normalizeStoryTitleForStorage(story.title);
    targetStory.addinfo = normalizeString(story.addinfo);
    targetStory.part = normalizeString(story.part);
    await targetStory.save();

    persistedCrawledStoryIdsByIndex.set(index, targetStory.id);
    targetStoryRefIndex.set(
      targetStoryRefKey(series.title, series.volume, mainIssue.number, toInt(story.number)),
      targetStory.id,
    );

    await syncStoryIndividuals(
      targetModels,
      targetEntityCache,
      targetStoryContext,
      targetStory.id,
      story.individuals,
    );
    await syncStoryAppearances(
      targetModels,
      targetEntityCache,
      targetStoryContext,
      targetStory.id,
      story.appearances,
    );

    if (story.reprintOf) {
      pendingCrawledReprints.push({
        targetStoryId: targetStory.id,
        seriesTitle: normalizeString(story.reprintOf.issue.series.title),
        volume: toInt(story.reprintOf.issue.series.volume),
        issueNumber: normalizeString(story.reprintOf.issue.number),
        storyNumber: story.reprintOf.number == null ? undefined : toInt(story.reprintOf.number),
      });
    }
  }

  const sourceSeriesId = toInt(evaluated.sourceIssue.series?.id);
  const groupIssues =
    sourceSeriesId > 0
      ? await loadIssueGroupByNumber(sourceModels, sourceSeriesId, evaluated.sourceIssue.number)
      : [];
  const groupMappings = buildIssueGroupStoryMappings(groupIssues, crawledIssue.stories);
  const sourceIssueMappings = buildStoryMappingsFromSourceStories(
    evaluated.sourceIssue.stories,
    crawledIssue.stories,
  );
  const storyMappings =
    groupMappings.length > 0
      ? groupMappings
      : sourceIssueMappings.length > 0
        ? sourceIssueMappings
        : Array.isArray(evaluated.report.storyMappings)
          ? evaluated.report.storyMappings
          : [];

  for (const mapping of storyMappings) {
    const targetStoryId = persistedCrawledStoryIdsByIndex.get(mapping.crawledStoryIndex);
    if (!targetStoryId || !mapping.sourceStoryId) continue;
    sourceStoryToTargetStoryId.set(mapping.sourceStoryId, targetStoryId);
  }

  for (const variant of crawledIssue.variants || []) {
    const variantName = normalizeString((variant as { variant?: string }).variant);
    if (!variantName) continue;

    const targetVariantIssue = await syncIssueScalars(targetModels, {
      title: '',
      number: normalizeString((variant as { number?: string }).number || mainIssue.number),
      format: normalizeString((variant as { format?: string }).format) || mainIssue.format,
      variant: variantName,
      releasedate:
        normalizeString((variant as { releasedate?: string }).releasedate) || mainIssue.releasedate,
      legacy_number:
        normalizeString((variant as { legacyNumber?: string }).legacyNumber) ||
        mainIssue.legacy_number,
      pages: 0,
      price: Number((variant as { price?: number }).price || 0),
      currency: normalizeString((variant as { currency?: string }).currency) || mainIssue.currency,
      verified: false,
      collected: false,
      comicguideid: '0',
      isbn: '',
      limitation: '0',
      addinfo: '',
      fk_series: targetSeries.id,
    });

    const variantCover = (variant as { cover?: CrawledCover }).cover;
    if (!variantCover) continue;
    const targetCover = await findOrCreateCover(
      targetModels,
      targetVariantIssue.id,
      toInt(variantCover.number),
      normalizeString(variantCover.url),
      '',
    );
    await syncCoverIndividuals(
      targetModels,
      targetEntityCache,
      targetCover.id,
      variantCover.individuals,
    );
  }
};

const flushPendingLinks = async (
  targetModels: DbModels,
  sourceStoryToTargetStoryId: Map<number, number>,
  pendingReprintLinks: Array<{ targetStoryId: number; sourceReprintStoryId: number }>,
  pendingCrawledReprints: Array<{
    targetStoryId: number;
    seriesTitle: string;
    volume: number;
    issueNumber: string;
    storyNumber?: number;
  }>,
  targetStoryRefIndex: Map<string, number>,
) => {
  for (let index = pendingReprintLinks.length - 1; index >= 0; index -= 1) {
    const pending = pendingReprintLinks[index];
    const mappedTargetReprintId = sourceStoryToTargetStoryId.get(pending.sourceReprintStoryId);
    if (!mappedTargetReprintId) continue;
    await targetModels.Story.update(
      { fk_reprint: mappedTargetReprintId },
      { where: { id: pending.targetStoryId } },
    );
    pendingReprintLinks.splice(index, 1);
  }

  for (let index = pendingCrawledReprints.length - 1; index >= 0; index -= 1) {
    const pending = pendingCrawledReprints[index];
    if (!pending.storyNumber) continue;
    const mappedTargetReprintId = targetStoryRefIndex.get(
      targetStoryRefKey(
        pending.seriesTitle,
        pending.volume,
        pending.issueNumber,
        pending.storyNumber,
      ),
    );
    if (!mappedTargetReprintId) continue;
    await targetModels.Story.update(
      { fk_reprint: mappedTargetReprintId },
      { where: { id: pending.targetStoryId } },
    );
    pendingCrawledReprints.splice(index, 1);
  }
};

const persistDeIssue = async (
  sourceModels: DbModels,
  targetModels: DbModels,
  targetEntityCache: TargetEntityCache,
  deIssueId: number,
  sourceStoryToTargetStoryId: Map<number, number>,
) => {
  const deIssue = await loadIssueGraph(sourceModels, deIssueId);
  if (!deIssue?.series?.publisher || !deIssue.series) {
    throw new Error(`Could not load DE issue ${deIssueId} for persistence`);
  }

  const requiredParentStoryIds = Array.from(
    new Set(
      (deIssue.stories || [])
        .map((story) => toInt(story.fk_parent))
        .filter((storyId) => storyId > 0),
    ),
  );
  const missingParentStoryIds = requiredParentStoryIds.filter(
    (sourceStoryId) => !sourceStoryToTargetStoryId.has(sourceStoryId),
  );
  if (missingParentStoryIds.length > 0) {
    await hydrateTargetParentStoryMappingsFromTarget(
      sourceModels,
      targetModels,
      sourceStoryToTargetStoryId,
      missingParentStoryIds,
    );
  }

  const unresolvedParentStoryIds = requiredParentStoryIds.filter(
    (sourceStoryId) => !sourceStoryToTargetStoryId.has(sourceStoryId),
  );
  if (unresolvedParentStoryIds.length > 0) {
    throw new MissingTargetParentStoryMappingError(issueLabel(deIssue), unresolvedParentStoryIds);
  }

  const { targetSeries } = await loadOrCreateTargetIssueGroupContext(
    targetModels,
    targetEntityCache,
    deIssue.series.publisher,
    deIssue.series,
  );

  const targetIssue = await syncIssueScalars(targetModels, {
    ...deIssue,
    fk_series: targetSeries.id,
  });
  const targetStoryContext = await loadTargetStoryPersistenceContext(
    targetModels,
    targetEntityCache,
    targetIssue.id,
  );
  await syncIssueIndividuals(targetModels, targetEntityCache, targetIssue.id, deIssue.individuals);
  await syncIssueArcs(targetModels, targetEntityCache, targetIssue.id, deIssue.arcs);

  for (const cover of deIssue.covers || []) {
    const targetCover = await findOrCreateCover(
      targetModels,
      targetIssue.id,
      toInt(cover.number),
      normalizeString(cover.url),
      normalizeString(cover.addinfo),
    );
    await syncCoverIndividuals(targetModels, targetEntityCache, targetCover.id, cover.individuals);
  }

  for (const story of deIssue.stories || []) {
    const existing = matchExistingStory(targetStoryContext, toInt(story.number), story.title);
    const targetStory =
      existing ||
      (await targetModels.Story.create({
        fk_issue: targetIssue.id,
        number: toInt(story.number),
        title: normalizeStoryTitleForStorage(story.title),
        onlyapp: Boolean(story.onlyapp),
        firstapp: Boolean(story.firstapp),
        otheronlytb: Boolean(story.otheronlytb),
        onlytb: Boolean(story.onlytb),
        onlyoneprint: Boolean(story.onlyoneprint),
        collected: Boolean(story.collected),
        collectedmultipletimes: Boolean(story.collectedmultipletimes),
        addinfo: normalizeString(story.addinfo),
        part: normalizeString(story.part),
      }));
    rememberTargetStoryInPersistenceContext(targetStoryContext, targetEntityCache, targetStory);

    targetStory.onlyapp = Boolean(story.onlyapp);
    targetStory.firstapp = Boolean(story.firstapp);
    targetStory.otheronlytb = Boolean(story.otheronlytb);
    targetStory.onlytb = Boolean(story.onlytb);
    targetStory.onlyoneprint = Boolean(story.onlyoneprint);
    targetStory.collected = Boolean(story.collected);
    targetStory.collectedmultipletimes = Boolean(story.collectedmultipletimes);
    targetStory.title = normalizeStoryTitleForStorage(story.title);
    targetStory.addinfo = normalizeString(story.addinfo);
    targetStory.part = normalizeString(story.part);
    const sourceParentStoryId = story.fk_parent == null ? null : toInt(story.fk_parent);
    const targetParentStoryId =
      sourceParentStoryId == null
        ? null
        : sourceStoryToTargetStoryId.get(sourceParentStoryId) || null;
    if (sourceParentStoryId != null && !targetParentStoryId) {
      throw new MissingTargetParentStoryMappingError(issueLabel(deIssue), [sourceParentStoryId]);
    }
    targetStory.fk_parent = targetParentStoryId;
    await targetStory.save();

    await syncStoryIndividuals(
      targetModels,
      targetEntityCache,
      targetStoryContext,
      targetStory.id,
      story.individuals,
    );
    await syncStoryAppearances(
      targetModels,
      targetEntityCache,
      targetStoryContext,
      targetStory.id,
      story.appearances,
    );
  }
};

export async function runReimport(options?: ReimportRunOptions): Promise<ReimportReport> {
  const dryRun = normalizeDryRun(options);
  const enableTargetDeFastPath = normalizeTargetDeFastPath(options);
  const collectDetails = normalizeCollectDetails(options, dryRun);
  const scope = options?.scope || defaultScope;
  const runStartedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const crawler = new MarvelCrawlerService();
  const internalSourceModels = options?.sourceModels ? null : createDbModels('shortbox');
  const sourceModels = options?.sourceModels || internalSourceModels!;
  const targetModels = dryRun ? null : options?.targetModels;
  if (!dryRun && !targetModels) {
    throw new Error('Prod mode requires targetModels.');
  }
  if (!dryRun && targetModels) {
    await ensureTargetSeriesGenreColumn(targetModels);
  }
  const seriesResults: ReimportSeriesResult[] = [];
  const summaryCounters: SummaryCounters = {
    reasons: {
      ok: 0,
      notFound: 0,
      storyCountMismatch: 0,
      storyCountMismatchSubset: 0,
      storyTitleMismatch: 0,
      crawlFailed: 0,
    },
    storyCountDirections: {
      crawlerHasMoreStories: 0,
      crawlerHasFewerStories: 0,
    },
  };
  let offset = 0;
  const counters: LiveCounters = {
    totalDeSeries: await countDeSeriesForScope(sourceModels, scope),
    totalDeIssues: await countDeIssuesForScope(sourceModels, scope),
    processedDeSeries: 0,
    processedDeIssues: 0,
    totalDeIssueDurationMs: 0,
    totalUsIssueGroups: await countUsIssueGroupsForScope(sourceModels),
    totalMappedUsIssues: 0,
    processedUsIssues: 0,
    processedUsIssueGroups: 0,
    results: {
      shortbox: 0,
      crawler: 0,
      moved: 0,
      manual: 0,
    },
  };

  const logProgress = (stage: string, extra?: string) => {
    const remainingUsIssueGroups = Math.max(
      0,
      counters.totalUsIssueGroups - counters.processedUsIssueGroups,
    );
    const averageUsIssueGroupDurationMs =
      counters.processedUsIssueGroups > 0
        ? (Date.now() - runStartedAtMs) / counters.processedUsIssueGroups
        : 0;
    const approxTimeLeft =
      counters.processedUsIssueGroups > 0 && remainingUsIssueGroups > 0
        ? formatApproxDuration(averageUsIssueGroupDurationMs * remainingUsIssueGroups)
        : 'n/a';
    const parts = [
      `[reimport][progress] ${stage}`,
      formatReimportCounter('Series', counters.processedDeSeries, counters.totalDeSeries),
      formatReimportCounter('DE', counters.processedDeIssues, counters.totalDeIssues),
      counters.totalUsIssueGroups > 0
        ? formatReimportCounter('US', counters.processedUsIssueGroups, counters.totalUsIssueGroups)
        : 'US n/a',
      `ETA ${approxTimeLeft}`,
      `Shortbox ${counters.results.shortbox}`,
      `Crawler ${counters.results.crawler}`,
      `Moved ${counters.results.moved}`,
      `Manual ${counters.results.manual}`,
    ];
    if (extra) parts.push(extra);
    console.log(parts.join(' '));
  };

  logger.info(
    `[reimport] starting DE->US ${dryRun ? 'dry-run' : 'prod-run'} (scope=${scope.kind}, batchSize=${SERIES_BATCH_SIZE}, targetDeFastPath=${enableTargetDeFastPath ? 'enabled' : 'disabled'})`,
  );
  logProgress(
    'start',
    `scope=${scope.kind} targetDeFastPath=${enableTargetDeFastPath ? 'enabled' : 'disabled'}`,
  );

  const persistedUsIssueGroupKeys = new Set<string>();
  const sourceStoryToTargetStoryId = new Map<number, number>();
  const pendingSourceReprintLinks: Array<{ targetStoryId: number; sourceReprintStoryId: number }> =
    [];
  const pendingCrawledReprints: Array<{
    targetStoryId: number;
    seriesTitle: string;
    volume: number;
    issueNumber: string;
    storyNumber?: number;
  }> = [];
  const targetStoryRefIndex = new Map<string, number>();
  const targetEntityCache = createTargetEntityCache();
  const targetIssueGroupPresenceCache = createTargetIssueGroupPresenceCache();
  const processedUsIssueGroupKeys = new Set<string>();

  const persistUsIssueGroupsForDeIssue = async (evaluatedUsIssues: EvaluatedUsIssue[]) => {
    if (dryRun || !targetModels) return;

    for (const evaluated of evaluatedUsIssues) {
      const result = evaluated.report;
      const groupKey = targetIssueGroupKey(
        toInt(evaluated.sourceIssue.series?.id),
        evaluated.sourceIssue.number,
      );
      if (persistedUsIssueGroupKeys.has(groupKey)) continue;

      if (shouldSkipUsIssuePersistence(result)) {
        persistedUsIssueGroupKeys.add(groupKey);
        continue;
      }

      if (result.result === 'crawler' || result.result === 'moved') {
        await persistCrawledUsIssueGroup(
          sourceModels,
          targetModels,
          targetEntityCache,
          targetIssueGroupPresenceCache,
          evaluated,
          sourceStoryToTargetStoryId,
          pendingCrawledReprints,
          targetStoryRefIndex,
        );
      } else if (shouldUseSourceIssuePayload(result)) {
        await persistSourceUsIssueGroup(
          sourceModels,
          targetModels,
          targetEntityCache,
          targetIssueGroupPresenceCache,
          evaluated,
          sourceStoryToTargetStoryId,
          pendingSourceReprintLinks,
          targetStoryRefIndex,
        );
      } else {
        persistedUsIssueGroupKeys.add(groupKey);
        continue;
      }
      persistedUsIssueGroupKeys.add(groupKey);
    }
  };

  const persistCurrentDeIssueFromSource = async (deIssueId: number) => {
    if (dryRun || !targetModels) return { ok: true as const };

    await flushPendingLinks(
      targetModels,
      sourceStoryToTargetStoryId,
      pendingSourceReprintLinks,
      pendingCrawledReprints,
      targetStoryRefIndex,
    );

    try {
      await persistDeIssue(
        sourceModels,
        targetModels,
        targetEntityCache,
        deIssueId,
        sourceStoryToTargetStoryId,
      );
      return { ok: true as const };
    } catch (error) {
      if (error instanceof MissingTargetParentStoryMappingError) {
        return {
          ok: false as const,
          missingSourceStoryIds: error.missingSourceStoryIds,
          message: error.message,
        };
      }
      throw error;
    }
  };

  try {
    while (true) {
      const seriesBatch = await loadSeriesBatchForScope(
        sourceModels,
        scope,
        offset,
        SERIES_BATCH_SIZE,
      );
      if (seriesBatch.length === 0) break;
      offset += seriesBatch.length;
      console.log(`[reimport][batch] Loaded ${seriesBatch.length} DE series (offset ${offset})`);

      for (const deSeries of seriesBatch) {
        const deIssues = await loadDeIssuesForSeries(sourceModels, toInt(deSeries.id));
        const issueResults: ReimportDeIssueResult[] = [];
        console.log(
          `[reimport][series] ${formatReimportCounter(
            'Series',
            counters.processedDeSeries + 1,
            counters.totalDeSeries,
          )} | ${normalizeString(deSeries.title)} (Vol. ${toInt(deSeries.volume)}) | ${deIssues.length} DE issues`,
        );

        for (const deIssue of deIssues) {
          const deIssueStartedAtMs = Date.now();
          const finishDeIssue = () => {
            const durationMs = Date.now() - deIssueStartedAtMs;
            counters.totalDeIssueDurationMs += durationMs;
            counters.processedDeIssues += 1;
            return durationMs;
          };
          const { rootUsStoryIds, usIssueIds } = await loadLinkedUsIssueIdsForDeIssue(
            sourceModels,
            deIssue,
          );
          counters.totalMappedUsIssues += usIssueIds.length;

          if (
            !dryRun &&
            targetModels &&
            enableTargetDeFastPath &&
            (await targetDeIssueLooksComplete(targetModels, deIssue))
          ) {
            counters.processedUsIssues += usIssueIds.length;
            const skippedUsIssueGroupKeys = await loadUsIssueGroupKeys(sourceModels, usIssueIds);
            for (const usIssueGroupKey of skippedUsIssueGroupKeys) {
              if (processedUsIssueGroupKeys.has(usIssueGroupKey)) continue;
              processedUsIssueGroupKeys.add(usIssueGroupKey);
              counters.processedUsIssueGroups += 1;
            }
            console.log(
              formatIssueLog('skip', 'ok', issueLabel(deIssue), ['target issue already complete']),
            );
            if (collectDetails) {
              issueResults.push({
                id: toInt(deIssue.id),
                label: issueLabel(deIssue),
                status: 'ok',
                linkedUsIssueIds: [],
                usIssues: [],
              });
            }
            const issueDurationMs = finishDeIssue();
            console.log(
              formatIssueLog('skip', 'ok', issueLabel(deIssue), [
                'target issue already complete',
                `linked US issues ${usIssueIds.length}`,
                `duration=${formatIssueDuration(issueDurationMs)}`,
              ]),
            );
            logProgress(
              'issue-done',
              `label=${issueLabel(deIssue)} skipped=target-complete us=${usIssueIds.length} groups=${skippedUsIssueGroupKeys.size}`,
            );
            continue;
          }

          console.log(
            formatIssueLog('start', 'info', issueLabel(deIssue), [
              `parent stories ${rootUsStoryIds.length}`,
              `linked US issues ${usIssueIds.length}`,
            ]),
          );

          const usIssues: ReimportUsIssueResult[] = [];
          const evaluationCache: EvaluationCache = new Map<number, Promise<EvaluatedUsIssue>>();
          const evaluatedUsIssues = await mapWithConcurrency(
            usIssueIds,
            US_EVALUATION_CONCURRENCY,
            async (usIssueId) =>
              evaluateUsIssue(
                sourceModels,
                usIssueId,
                crawler,
                evaluationCache,
                targetIssueGroupPresenceCache,
                targetModels,
              ),
          );

          for (const evaluated of evaluatedUsIssues) {
            const result = evaluated.report;
            const usIssueGroupKey = targetIssueGroupKey(
              toInt(evaluated.sourceIssue.series?.id),
              evaluated.sourceIssue.number,
            );
            usIssues.push(result);
            counters.processedUsIssues += 1;
            if (!processedUsIssueGroupKeys.has(usIssueGroupKey)) {
              processedUsIssueGroupKeys.add(usIssueGroupKey);
              counters.processedUsIssueGroups += 1;
            }
            counters.results[result.result] += 1;
            if (result.reason === 'ok') summaryCounters.reasons.ok += 1;
            if (result.reason === 'not-found') summaryCounters.reasons.notFound += 1;
            if (result.reason === 'story-count-mismatch')
              summaryCounters.reasons.storyCountMismatch += 1;
            if (result.reason === 'story-count-mismatch-subset')
              summaryCounters.reasons.storyCountMismatchSubset += 1;
            if (result.reason === 'story-title-mismatch')
              summaryCounters.reasons.storyTitleMismatch += 1;
            if (result.reason === 'crawl-failed') summaryCounters.reasons.crawlFailed += 1;
            if (result.storyCountDirection === 'crawler-has-more-stories') {
              summaryCounters.storyCountDirections.crawlerHasMoreStories += 1;
            }
            if (result.storyCountDirection === 'crawler-has-fewer-stories') {
              summaryCounters.storyCountDirections.crawlerHasFewerStories += 1;
            }
            console.log(formatUsIssueLog(result));
          }
          const deIssueStatus = formatIssueStatus(usIssues);

          const hasManual = evaluatedUsIssues.some(
            (evaluated) => evaluated.report.result === 'manual',
          );
          if (hasManual) {
            const manualCount = evaluatedUsIssues.filter(
              (evaluated) => evaluated.report.result === 'manual',
            ).length;
            let sourcePersistenceApplied = false;
            let sourcePersistenceError: string | null = null;
            if (!dryRun && targetModels) {
              await persistUsIssueGroupsForDeIssue(evaluatedUsIssues);
              const persistenceResult = await persistCurrentDeIssueFromSource(toInt(deIssue.id));
              sourcePersistenceApplied = persistenceResult.ok;
              if (!persistenceResult.ok) {
                sourcePersistenceError =
                  persistenceResult.missingSourceStoryIds.length > 0
                    ? `missing parent story ids ${persistenceResult.missingSourceStoryIds.join(', ')}`
                    : persistenceResult.message;
              }
            }
            if (collectDetails) {
              issueResults.push({
                id: toInt(deIssue.id),
                label: issueLabel(deIssue),
                status: 'manual',
                linkedUsIssueIds: usIssueIds,
                usIssues,
              });
            }
            const issueDurationMs = finishDeIssue();
            const manualExtras = [
              `${manualCount}/${evaluatedUsIssues.length} linked US issues require manual review`,
              sourcePersistenceApplied ? 'source persistence applied' : 'persistence skipped',
              `duration=${formatIssueDuration(issueDurationMs)}`,
            ];
            if (sourcePersistenceError) {
              manualExtras.splice(2, 0, sourcePersistenceError);
            }
            console.log(formatIssueLog('manual', 'manual', issueLabel(deIssue), manualExtras));
            logProgress('issue-manual', `label=${issueLabel(deIssue)}`);
            continue;
          }

          const missingParentStoryIds = await findMissingDeParentStoryIds(
            sourceModels,
            deIssue,
            evaluatedUsIssues,
            sourceStoryToTargetStoryId,
          );
          if (missingParentStoryIds.length > 0) {
            let sourcePersistenceApplied = false;
            let sourcePersistenceError: string | null = null;
            if (!dryRun && targetModels) {
              await persistUsIssueGroupsForDeIssue(evaluatedUsIssues);
              const persistenceResult = await persistCurrentDeIssueFromSource(toInt(deIssue.id));
              sourcePersistenceApplied = persistenceResult.ok;
              if (!persistenceResult.ok) {
                sourcePersistenceError =
                  persistenceResult.missingSourceStoryIds.length > 0
                    ? `missing parent story ids ${persistenceResult.missingSourceStoryIds.join(', ')}`
                    : persistenceResult.message;
              }
            }
            if (collectDetails) {
              issueResults.push({
                id: toInt(deIssue.id),
                label: issueLabel(deIssue),
                status: 'manual',
                linkedUsIssueIds: usIssueIds,
                usIssues,
              });
            }
            const issueDurationMs = finishDeIssue();
            const manualExtras = [
              `unresolved parent story ids ${missingParentStoryIds.join(', ')}`,
              sourcePersistenceApplied ? 'source persistence applied' : 'persistence skipped',
              `duration=${formatIssueDuration(issueDurationMs)}`,
            ];
            if (sourcePersistenceError) {
              manualExtras.splice(2, 0, sourcePersistenceError);
            }
            console.log(formatIssueLog('manual', 'manual', issueLabel(deIssue), manualExtras));
            logProgress(
              'issue-manual',
              `label=${issueLabel(deIssue)} missingParents=${missingParentStoryIds.length}`,
            );
            continue;
          }

          if (!dryRun && targetModels) {
            await persistUsIssueGroupsForDeIssue(evaluatedUsIssues);
            const persistenceResult = await persistCurrentDeIssueFromSource(toInt(deIssue.id));
            if (!persistenceResult.ok) {
              if (collectDetails) {
                issueResults.push({
                  id: toInt(deIssue.id),
                  label: issueLabel(deIssue),
                  status: 'manual',
                  linkedUsIssueIds: usIssueIds,
                  usIssues,
                });
              }
              const issueDurationMs = finishDeIssue();
              console.log(
                formatIssueLog('manual', 'manual', issueLabel(deIssue), [
                  persistenceResult.missingSourceStoryIds.length > 0
                    ? `unresolved parent story ids ${persistenceResult.missingSourceStoryIds.join(', ')}`
                    : 'unresolved parent story ids',
                  'source persistence skipped',
                  `duration=${formatIssueDuration(issueDurationMs)}`,
                ]),
              );
              logProgress(
                'issue-manual',
                `label=${issueLabel(deIssue)} missingParents=${persistenceResult.missingSourceStoryIds.length || 1}`,
              );
              continue;
            }
          }
          if (collectDetails) {
            issueResults.push({
              id: toInt(deIssue.id),
              label: issueLabel(deIssue),
              status: deIssueStatus,
              linkedUsIssueIds: usIssueIds,
              usIssues,
            });
          }
          const issueDurationMs = finishDeIssue();
          console.log(
            formatIssueLog('done', deIssueStatus, issueLabel(deIssue), [
              `${usIssueIds.length} linked US issues processed`,
              `duration=${formatIssueDuration(issueDurationMs)}`,
            ]),
          );
          logProgress('issue-done', `label=${issueLabel(deIssue)}`);
        }

        if (collectDetails) {
          seriesResults.push({
            id: toInt(deSeries.id),
            title: normalizeString(deSeries.title),
            volume: toInt(deSeries.volume),
            publisherName: normalizeString(deSeries.publisher?.name),
            issues: issueResults,
          });
        }
        counters.processedDeSeries += 1;
        logProgress(
          'series-done',
          `label=${normalizeString(deSeries.title)} (Vol. ${toInt(deSeries.volume)})`,
        );
      }
    }

    const report: ReimportReport = {
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      scope,
      summary: {
        totalDeSeries: counters.processedDeSeries,
        totalDeIssues: counters.processedDeIssues,
        totalMappedUsIssues: counters.totalMappedUsIssues,
        results: {
          shortbox: counters.results.shortbox,
          crawler: counters.results.crawler,
          moved: counters.results.moved,
          manual: counters.results.manual,
        },
        reasons: {
          ok: summaryCounters.reasons.ok,
          notFound: summaryCounters.reasons.notFound,
          storyCountMismatch: summaryCounters.reasons.storyCountMismatch,
          storyCountMismatchSubset: summaryCounters.reasons.storyCountMismatchSubset,
          storyTitleMismatch: summaryCounters.reasons.storyTitleMismatch,
          crawlFailed: summaryCounters.reasons.crawlFailed,
        },
        storyCountDirections: {
          crawlerHasMoreStories: summaryCounters.storyCountDirections.crawlerHasMoreStories,
          crawlerHasFewerStories: summaryCounters.storyCountDirections.crawlerHasFewerStories,
        },
      },
      series: collectDetails ? seriesResults : [],
    };

    logger.info(
      `[reimport] finished DE->US ${dryRun ? 'dry-run' : 'prod-run'} series=${report.summary.totalDeSeries} deIssues=${report.summary.totalDeIssues} usIssues=${report.summary.totalMappedUsIssues}`,
    );
    logProgress('finished');

    return report;
  } finally {
    await closeDbModels(internalSourceModels);
  }
}

export async function triggerManualReimportDryRun(scope?: ReimportScope): Promise<ReimportReport> {
  return runReimport({ dryRun: true, scope: scope || defaultScope });
}
