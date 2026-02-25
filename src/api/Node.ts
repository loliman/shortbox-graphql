import gql from 'graphql-tag';
import models from '../models';
import { NodeResolvers } from '../types/graphql';
import { QueryTypes } from 'sequelize';

export const typeDef = gql`
  extend type Query {
    nodes(pattern: String!, us: Boolean!, offset: Int): [Node]
  }

  type Node {
    type: String
    label: String
    url: String
  }
`;

type ParsedSearchPattern = {
  raw: string;
  title: string;
  volume?: number;
  year?: number;
  issueNumber?: string;
};

type SearchIndexRow = {
  node_type: 'publisher' | 'series' | 'issue';
  label: string;
  url: string;
  publisher_name: string | null;
  series_title: string | null;
  series_volume: number | null;
  series_startyear: number | null;
  series_endyear: number | null;
  issue_number: string | null;
  issue_format: string | null;
  issue_variant: string | null;
  issue_title: string | null;
  ts_rank: number | null;
  trigram_rank: number | null;
};

type NodeCandidate = {
  type: 'publisher' | 'series' | 'issue';
  label: string;
  url: string;
  relevance: number;
  seriesTitleSort?: string;
  seriesVolumeSort?: number;
  issueNumberSort?: string;
  issueFormatSort?: string;
  issueVariantSort?: string;
  seriesKey?: string;
};

const SEARCH_RESULT_LIMIT = 20;
const SEARCH_POOL_LIMIT = 500;
const SEARCH_TYPE_POOL_LIMITS = {
  series: 250,
  issue: 900,
  publisher: 120,
} as const;

export const resolvers: NodeResolvers = {
  Query: {
    nodes: async (_, { pattern, us, offset }) => {
      if (!pattern || pattern.trim() === '') return [];

      const parsed = parseSearchPattern(pattern);
      const runSearch = async (rawQuery: string) =>
        models.sequelize.query<SearchIndexRow>(
          `
            WITH ranked AS (
              SELECT
                si.node_type,
                si.label,
                si.url,
                si.publisher_name,
                si.series_title,
                si.series_volume,
                si.series_startyear,
                si.series_endyear,
                si.issue_number,
                si.issue_format,
                si.issue_variant,
                si.issue_title,
                ts_rank_cd(
                  si.search_tsv,
                  websearch_to_tsquery('simple', unaccent(CAST(:q_raw AS text)))
                ) AS ts_rank,
                similarity(si.search_text, unaccent(CAST(:q_raw AS text))) AS trigram_rank,
                ROW_NUMBER() OVER (
                  PARTITION BY si.node_type
                  ORDER BY
                    ts_rank_cd(
                      si.search_tsv,
                      websearch_to_tsquery('simple', unaccent(CAST(:q_raw AS text)))
                    ) DESC,
                    similarity(si.search_text, unaccent(CAST(:q_raw AS text))) DESC,
                    si.label ASC
                ) AS type_rank
              FROM shortbox.search_index si
              WHERE si.us = CAST(:us AS boolean)
                AND (
                  si.search_tsv @@ websearch_to_tsquery('simple', unaccent(CAST(:q_raw AS text)))
                  OR si.search_text ILIKE CAST(:q_like AS text)
                )
            )
            SELECT
              node_type,
              label,
              url,
              publisher_name,
              series_title,
              series_volume,
              series_startyear,
              series_endyear,
              issue_number,
              issue_format,
              issue_variant,
              issue_title,
              ts_rank,
              trigram_rank
            FROM ranked
            WHERE
              (node_type = 'series' AND type_rank <= CAST(:series_pool_limit AS integer))
              OR (node_type = 'issue' AND type_rank <= CAST(:issue_pool_limit AS integer))
              OR (node_type = 'publisher' AND type_rank <= CAST(:publisher_pool_limit AS integer))
            ORDER BY ts_rank DESC, trigram_rank DESC, label ASC
            LIMIT CAST(:pool_limit AS integer)
          `,
          {
            replacements: {
              us: Boolean(us),
              q_raw: rawQuery,
              q_like: `%${normalizeForSearch(rawQuery).replace(/\s+/g, '%')}%`,
              pool_limit: SEARCH_POOL_LIMIT,
              series_pool_limit: SEARCH_TYPE_POOL_LIMITS.series,
              issue_pool_limit: SEARCH_TYPE_POOL_LIMITS.issue,
              publisher_pool_limit: SEARCH_TYPE_POOL_LIMITS.publisher,
            },
            type: QueryTypes.SELECT,
          },
        );

      const primaryRows = await runSearch(parsed.raw);
      let rows = primaryRows;
      if (parsed.issueNumber) {
        const seriesScopedRaw = buildSeriesScopedRaw(parsed);
        if (seriesScopedRaw && seriesScopedRaw !== parsed.raw) {
          const extraRows = await runSearch(seriesScopedRaw);
          const deduped = new Map<string, SearchIndexRow>();
          for (const row of [...primaryRows, ...extraRows]) {
            const key = `${row.node_type}::${row.url}::${row.label}`;
            if (!deduped.has(key)) deduped.set(key, row);
          }
          rows = [...deduped.values()];
        }
      }

      const candidates: NodeCandidate[] = rows
        .map((row) => toCandidate(row, parsed))
        .filter((candidate): candidate is NodeCandidate => Boolean(candidate));

      const balanced = buildSeriesFirstBlocks(candidates, {
        maxSeries: 12,
        maxIssues: 20,
        maxAdditionalIssuesPerSeries: 5,
        maxPublishers: 6,
        titleQuery: parsed.title || parsed.raw,
        volumeQuery: parsed.volume,
        issueNumberQuery: parsed.issueNumber,
      });
      const start = offset || 0;
      const end = start + SEARCH_RESULT_LIMIT;
      return balanced.slice(start, end);
    },
  },
  Node: {
    type: (parent) => (parent as { type?: string }).type || null,
    label: (parent) => (parent as { label?: string }).label || null,
    url: (parent) => (parent as { url?: string }).url || null,
  },
};

function toCandidate(row: SearchIndexRow, parsed: ParsedSearchPattern): NodeCandidate | null {
  const type = row.node_type;
  if (type !== 'publisher' && type !== 'series' && type !== 'issue') return null;

  const seriesTitle = normalizeForSearch(row.series_title || '');
  const normalizedTitlePattern = normalizeForSearch(parsed.title || parsed.raw);
  const issueNumber = (row.issue_number || '').trim();
  const issueVariant = (row.issue_variant || '').trim();

  if (type === 'issue') {
    if (parsed.issueNumber && !normalizeForSearch(issueNumber).startsWith(normalizeForSearch(parsed.issueNumber))) {
      return null;
    }
    if (parsed.volume != null && Number(row.series_volume || 0) !== parsed.volume) return null;
    if (parsed.year != null && !isYearMatch(row.series_startyear, row.series_endyear, parsed.year)) {
      return null;
    }
    if (
      hasStructuredQualifier(parsed) &&
      normalizedTitlePattern &&
      !seriesTitle.includes(normalizedTitlePattern)
    ) {
      return null;
    }
  }

  if (type === 'series') {
    if (parsed.volume != null && Number(row.series_volume || 0) !== parsed.volume) return null;
    if (parsed.year != null && !isYearMatch(row.series_startyear, row.series_endyear, parsed.year)) {
      return null;
    }
  }

  let relevance =
    (Number(row.ts_rank || 0) * 1000) + (Number(row.trigram_rank || 0) * 300) + scoreStringMatch(row.label, parsed.raw);

  if (type === 'series') {
    if (normalizedTitlePattern && seriesTitle.includes(normalizedTitlePattern)) relevance += 240;
    if (parsed.volume != null && Number(row.series_volume || 0) === parsed.volume) relevance += 200;
    if (parsed.year != null && isYearMatch(row.series_startyear, row.series_endyear, parsed.year)) relevance += 180;
    relevance += scoreIdentityBonus(
      `${row.series_title || ''} vol ${row.series_volume || ''} ${row.series_startyear || ''}`,
      parsed.raw,
    );
  } else if (type === 'issue') {
    if (
      normalizedTitlePattern &&
      (normalizeForSearch(row.issue_title || '').includes(normalizedTitlePattern) ||
        seriesTitle.includes(normalizedTitlePattern))
    ) {
      relevance += 220;
    }
    if (parsed.volume != null && Number(row.series_volume || 0) === parsed.volume) relevance += 180;
    if (parsed.year != null && isYearMatch(row.series_startyear, row.series_endyear, parsed.year)) relevance += 170;
    if (
      parsed.issueNumber &&
      normalizeForSearch(issueNumber).startsWith(normalizeForSearch(parsed.issueNumber))
    ) {
      relevance += 210;
    }
    relevance += scoreIdentityBonus(
      `${row.series_title || ''} vol ${row.series_volume || ''} ${row.series_startyear || ''} ${row.issue_number || ''} ${row.issue_format || ''} ${row.issue_variant || ''}`,
      parsed.raw,
    );
  }

  return {
    type,
    label: type === 'issue' ? buildIssueDisplayLabel(row) : row.label,
    url: row.url,
    relevance,
    seriesTitleSort: row.series_title || '',
    seriesVolumeSort: Number(row.series_volume || 0),
    issueNumberSort: issueNumber,
    issueFormatSort: row.issue_format || '',
    issueVariantSort: issueVariant,
    seriesKey: `${row.publisher_name || ''}::${row.series_title || ''}::${row.series_volume || ''}::${row.series_startyear || ''}`,
  };
}

function parseSearchPattern(input: string): ParsedSearchPattern {
  const raw = input.trim();
  const tokens = raw
    .split(/\s+/)
    .map((token) => cleanSearchToken(token))
    .filter((token) => token.length > 0);
  const rest = [...tokens];
  let issueNumber: string | undefined;
  let volume: number | undefined;
  let year: number | undefined;

  for (let idx = 0; idx < rest.length - 1; idx += 1) {
    const marker = rest[idx]?.toLowerCase();
    if (marker !== 'vol' && marker !== 'volume' && marker !== 'v') continue;
    const parsedVolume = parsePositiveInt(rest[idx + 1]);
    if (parsedVolume == null) continue;
    volume = parsedVolume;
    rest.splice(idx, 2);
    break;
  }

  for (let idx = rest.length - 1; idx >= 0; idx -= 1) {
    const parsedYear = parseYear(rest[idx]);
    if (parsedYear == null) continue;
    year = parsedYear;
    rest.splice(idx, 1);
    break;
  }

  const trailingIssue = rest[rest.length - 1];
  if (rest.length > 1 && trailingIssue && looksLikeIssueNumberToken(trailingIssue)) {
    issueNumber = trailingIssue;
    rest.pop();
  }

  const title = rest.join(' ').trim();
  return {
    raw,
    title,
    volume,
    year,
    issueNumber,
  };
}

function cleanSearchToken(token: string): string {
  return token
    .trim()
    .replace(/^[^0-9a-zA-Z]+/, '')
    .replace(/[^0-9a-zA-Z/]+$/, '');
}

function hasStructuredQualifier(parsed: ParsedSearchPattern): boolean {
  return parsed.volume != null || parsed.year != null || Boolean(parsed.issueNumber);
}

function looksLikeIssueNumberToken(token: string): boolean {
  return /^[0-9]+(?:[A-Za-z]|\/[0-9]+)?$/.test(token);
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseYear(value: string | undefined): number | null {
  const parsed = parsePositiveInt(value);
  if (parsed == null) return null;
  return parsed >= 1800 && parsed <= 2200 ? parsed : null;
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreStringMatch(label: string, rawPattern: string): number {
  const normalizedLabel = normalizeForSearch(label);
  const normalizedPattern = normalizeForSearch(rawPattern);
  if (!normalizedPattern) return 0;

  let score = 0;
  if (normalizedLabel === normalizedPattern) score += 320;
  else if (normalizedLabel.startsWith(normalizedPattern)) score += 180;
  else if (normalizedLabel.includes(normalizedPattern)) score += 90;

  const patternTokens = normalizedPattern.split(/\s+/).filter(Boolean);
  for (const token of patternTokens) {
    if (normalizedLabel.includes(token)) score += 18;
  }

  return score;
}

function scoreIdentityBonus(identity: string, rawPattern: string): number {
  const normalizedIdentity = normalizeForSearch(identity);
  const normalizedPattern = normalizeForSearch(rawPattern);
  if (!normalizedPattern) return 0;
  if (normalizedIdentity === normalizedPattern) return 600;
  if (normalizedIdentity.startsWith(normalizedPattern)) return 360;
  if (normalizedIdentity.includes(normalizedPattern)) return 180;
  return 0;
}

function isYearMatch(startyear: number | null, endyear: number | null, year: number): boolean {
  const start = Number(startyear || 0);
  const end = Number(endyear || 0);
  if (start === year || end === year) return true;
  if (start > 0 && start <= year) {
    if (end <= 0 || end >= year) return true;
  }
  return false;
}

function compareIssueNumberForSort(leftRaw: string, rightRaw: string): number {
  return leftRaw.localeCompare(rightRaw, undefined, { numeric: true, sensitivity: 'base' });
}

function sortSeriesCandidates(left: NodeCandidate, right: NodeCandidate): number {
  if (left.relevance !== right.relevance) return right.relevance - left.relevance;
  return left.label.localeCompare(right.label);
}

function sortIssueCandidates(left: NodeCandidate, right: NodeCandidate): number {
  const numberCompare = compareIssueNumberForSort(left.issueNumberSort || '', right.issueNumberSort || '');
  if (numberCompare !== 0) return numberCompare;

  if (left.relevance !== right.relevance) return right.relevance - left.relevance;

  const formatCompare = (left.issueFormatSort || '').localeCompare(right.issueFormatSort || '');
  if (formatCompare !== 0) return formatCompare;

  const variantCompare = (left.issueVariantSort || '').localeCompare(right.issueVariantSort || '');
  if (variantCompare !== 0) return variantCompare;

  return left.label.localeCompare(right.label);
}

function sortIssueRepresentatives(left: NodeCandidate, right: NodeCandidate): number {
  const formatCompare = compareIssueFormatPriority(left.issueFormatSort || '', right.issueFormatSort || '');
  if (formatCompare !== 0) return formatCompare;

  const leftVariant = String(left.issueVariantSort || '').trim();
  const rightVariant = String(right.issueVariantSort || '').trim();
  const leftIsRegular = leftVariant === '';
  const rightIsRegular = rightVariant === '';
  if (leftIsRegular !== rightIsRegular) return leftIsRegular ? -1 : 1;

  const variantCompare = leftVariant.localeCompare(rightVariant, undefined, { sensitivity: 'base' });
  if (variantCompare !== 0) return variantCompare;

  if (left.relevance !== right.relevance) return right.relevance - left.relevance;
  return left.label.localeCompare(right.label);
}

function compareIssueFormatPriority(leftFormat: string, rightFormat: string): number {
  return issueFormatPriority(leftFormat) - issueFormatPriority(rightFormat);
}

function issueFormatPriority(rawFormat: string): number {
  const normalized = normalizeForSearch(rawFormat);
  if (normalized === 'heft') return 0;
  if (normalized === 'softcover') return 1;
  if (normalized === 'hardcover' || normalized === 'hc') return 2;
  return 3;
}

function dedupeIssuesBySeriesAndNumber(issues: NodeCandidate[]): NodeCandidate[] {
  const grouped = new Map<string, NodeCandidate[]>();
  for (const issue of issues) {
    const groupKey = `${issue.seriesKey || ''}::${normalizeForSearch(issue.issueNumberSort || '')}`;
    const existing = grouped.get(groupKey);
    if (existing) existing.push(issue);
    else grouped.set(groupKey, [issue]);
  }

  const deduped: NodeCandidate[] = [];
  for (const entries of grouped.values()) {
    entries.sort(sortIssueRepresentatives);
    deduped.push(entries[0]);
  }
  return deduped;
}

function buildSeriesFirstBlocks(
  nodes: NodeCandidate[],
  limits: {
    maxSeries: number;
    maxIssues: number;
    maxAdditionalIssuesPerSeries: number;
    maxPublishers: number;
    titleQuery?: string;
    volumeQuery?: number;
    issueNumberQuery?: string;
  },
): NodeCandidate[] {
  const normalizedTitleQuery = normalizeForSearch(limits.titleQuery || '');
  const normalizedIssueNumberQuery = normalizeForSearch(limits.issueNumberQuery || '');
  const series = nodes.filter((node) => node.type === 'series').sort((left, right) => {
    const leftExactSeries =
      normalizedTitleQuery !== '' &&
      limits.volumeQuery != null &&
      normalizeForSearch(left.seriesTitleSort || '') === normalizedTitleQuery &&
      Number(left.seriesVolumeSort || 0) === Number(limits.volumeQuery);
    const rightExactSeries =
      normalizedTitleQuery !== '' &&
      limits.volumeQuery != null &&
      normalizeForSearch(right.seriesTitleSort || '') === normalizedTitleQuery &&
      Number(right.seriesVolumeSort || 0) === Number(limits.volumeQuery);
    if (leftExactSeries !== rightExactSeries) return leftExactSeries ? -1 : 1;
    return sortSeriesCandidates(left, right);
  });
  const issues = dedupeIssuesBySeriesAndNumber(nodes.filter((node) => node.type === 'issue'));
  const publishers = nodes.filter((node) => node.type === 'publisher').sort(sortSeriesCandidates);

  const issuesBySeries = new Map<string, NodeCandidate[]>();
  for (const issue of issues) {
    const key = issue.seriesKey || '';
    const grouped = issuesBySeries.get(key);
    if (grouped) grouped.push(issue);
    else issuesBySeries.set(key, [issue]);
  }
  for (const grouped of issuesBySeries.values()) {
    grouped.sort(sortIssueCandidates);
  }

  const pickBestIssueForSeries = (groupedIssues: NodeCandidate[]): NodeCandidate | undefined => {
    if (groupedIssues.length === 0) return undefined;
    return [...groupedIssues].sort((left, right) => {
      const leftExactNumber =
        normalizedIssueNumberQuery !== '' &&
        normalizeForSearch(left.issueNumberSort || '') === normalizedIssueNumberQuery;
      const rightExactNumber =
        normalizedIssueNumberQuery !== '' &&
        normalizeForSearch(right.issueNumberSort || '') === normalizedIssueNumberQuery;
      if (leftExactNumber !== rightExactNumber) return leftExactNumber ? -1 : 1;

      if (left.relevance !== right.relevance) return right.relevance - left.relevance;
      return sortIssueCandidates(left, right);
    })[0];
  };

  const result: NodeCandidate[] = [];
  let addedSeries = 0;
  let addedIssues = 0;
  const consumedIssueKeys = new Set<string>();

  for (const seriesNode of series) {
    if (addedSeries >= limits.maxSeries) break;
    result.push(seriesNode);
    addedSeries += 1;

    if (addedIssues >= limits.maxIssues) continue;
    const key = seriesNode.seriesKey || '';
    const groupedIssues = issuesBySeries.get(key) || [];
    if (groupedIssues.length === 0) continue;

    const bestMatch = pickBestIssueForSeries(groupedIssues);
    if (bestMatch && addedIssues < limits.maxIssues) {
      result.push(bestMatch);
      addedIssues += 1;
      consumedIssueKeys.add(`${bestMatch.url}::${bestMatch.label}`);
    }

    const numericOthers = groupedIssues.filter(
      (issue) => `${issue.url}::${issue.label}` !== `${bestMatch?.url}::${bestMatch?.label}`,
    );
    let additionalCount = 0;
    for (const issue of numericOthers) {
      if (additionalCount >= limits.maxAdditionalIssuesPerSeries) break;
      if (addedIssues >= limits.maxIssues) break;
      result.push(issue);
      addedIssues += 1;
      additionalCount += 1;
      consumedIssueKeys.add(`${issue.url}::${issue.label}`);
    }
  }

  // Fallback: issues without a matching series row still remain visible.
  if (addedIssues < limits.maxIssues) {
    const remainingIssues = issues
      .filter((issue) => !consumedIssueKeys.has(`${issue.url}::${issue.label}`))
      .sort((left, right) => {
        if (left.relevance !== right.relevance) return right.relevance - left.relevance;
        return sortIssueCandidates(left, right);
      });
    for (const issue of remainingIssues) {
      if (addedIssues >= limits.maxIssues) break;
      result.push(issue);
      addedIssues += 1;
    }
  }

  let addedPublishers = 0;
  for (const publisher of publishers) {
    if (addedPublishers >= limits.maxPublishers) break;
    result.push(publisher);
    addedPublishers += 1;
  }

  return result;
}

function buildSeriesScopedRaw(parsed: ParsedSearchPattern): string {
  const tokens: string[] = [];
  if (parsed.title) tokens.push(parsed.title);
  if (parsed.volume != null) tokens.push('vol', String(parsed.volume));
  if (parsed.year != null) tokens.push(String(parsed.year));
  return tokens.join(' ').trim();
}

function buildIssueDisplayLabel(row: SearchIndexRow): string {
  const sourceLabel = String(row.label || '').trim();
  const issueNumber = String(row.issue_number || '').trim();
  const issueTitle = String(row.issue_title || '').trim();
  if (!sourceLabel || !issueNumber) return sourceLabel;

  const hashIndex = sourceLabel.indexOf(' #');
  const seriesLabel = hashIndex >= 0 ? sourceLabel.slice(0, hashIndex).trim() : sourceLabel;
  const titleSuffix = issueTitle ? `: ${issueTitle}` : '';
  return `${seriesLabel} #${issueNumber}${titleSuffix}`;
}
