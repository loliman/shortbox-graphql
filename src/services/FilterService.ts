import {
  FindOptions,
  Includeable,
  Op,
  Order,
  ProjectionAlias,
  Sequelize,
  WhereOptions,
} from 'sequelize';
import models from '../models';
import { naturalCompare, generateLabel, asyncForEach } from '../util/util';
import { GraphQLError } from 'graphql';
import type { Filter } from '@loliman/shortbox-contract';
import logger from '../util/logger';
const dateFormat = require('dateformat');
const alphaCompare = (a: string, b: string): number => a.localeCompare(b);
const MULTI_FILTER_SEPARATOR_REGEX = /\s*\|\|\s*/g;

const dedupeTerms = (values: string[]): string[] =>
  values
    .map((value) => value.trim())
    .filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

const splitFilterTerms = (value: string | null | undefined): string[] => {
  if (!value) return [];
  return dedupeTerms(value.split(MULTI_FILTER_SEPARATOR_REGEX));
};

const escapeLikeValue = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

const isNumericFilterValue = (value: string): boolean => /^\d+(\.\d+)?$/.test(value.trim());
const TRANSLATOR_STORY_INDIVIDUAL_TYPE = 'TRANSLATOR';

type ExportPublisher = { name: string };
type ExportSeries = {
  title: string;
  volume: number;
  startyear: number;
  endyear: number;
  publisher: ExportPublisher;
};
type ExportIssueData = {
  number: string;
  format: string;
  variant: string;
  pages: number;
  releasedate: string;
  price: number;
  currency: string;
  series: ExportSeries;
};
type ExportResponse = Record<string, Record<string, ExportIssueData[]>>;
type SortedExportResponse = Array<[string, Array<[string, ExportIssueData[]]>]>;
type ExportIssueRecord = {
  number: string;
  format: string;
  variant: string;
  pages: number;
  releasedate: string;
  price: number;
  currency: string;
  series: {
    title: string;
    volume: number;
    startyear: number;
    endyear: number;
    publisher: {
      name: string;
    };
  };
};

type RuntimeFilter = Filter & {
  noComicguideId?: boolean;
  onlyNotCollectedNoOwnedVariants?: boolean;
  notFirstPrint?: boolean;
  notOnlyPrint?: boolean;
  notOnlyTb?: boolean;
  notExclusive?: boolean;
  notReprint?: boolean;
  notOtherOnlyTb?: boolean;
  notNoPrint?: boolean;
  notOnlyOnePrint?: boolean;
  genres?: Array<string | null> | null;
  arcs?: Array<{ title?: string | null }> | string | null;
  appearances?: Array<{ name?: string | null }> | string | null;
  realities?: Array<{ name?: string | null }> | string | null;
};

const buildSeriesExportLabel = async (series: ExportSeries): Promise<string> => {
  const generated = await generateLabel(series);
  if (generated.trim().length > 0) return generated;

  const title = (series.title || '').trim();
  if (title.length === 0) return 'Unbekannte Serie';

  let label = title;
  if (series.volume && series.volume > 0) {
    label += ` (Vol. ${series.volume})`;
  }
  if (series.startyear && series.startyear > 0) {
    const endyear =
      !series.endyear || series.endyear <= 0 || series.endyear === series.startyear
        ? `${series.startyear}`
        : `${series.startyear} - ${series.endyear}`;
    label += ` (${endyear})`;
  }

  return label;
};

export class FilterService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    if (level === 'error') {
      logger.error(message, { requestId: this.requestId });
      return;
    }
    if (level === 'warn') {
      logger.warn(message, { requestId: this.requestId });
      return;
    }
    logger.info(message, { requestId: this.requestId });
  }

  public async export(filter: Filter, type: string, loggedIn: boolean) {
    if (type !== 'txt' && type !== 'csv') {
      throw new GraphQLError('Gültige Export Typen: txt, csv', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const options = this.getFilterOptions(loggedIn, filter, true);
    const issues = await this.models.Issue.findAll(options);

    const response: ExportResponse = {};
    await asyncForEach(issues, async (issue) => {
      const issueRecord = issue as unknown as ExportIssueRecord;
      const p = issueRecord.series.publisher;
      const s = issueRecord.series;

      const publisher: ExportPublisher = { name: p.name };
      const series: ExportSeries = {
        title: s.title,
        volume: s.volume,
        startyear: s.startyear,
        endyear: s.endyear,
        publisher,
      };
      const issueData: ExportIssueData = {
        number: issueRecord.number,
        format: issueRecord.format,
        variant: issueRecord.variant,
        pages: issueRecord.pages,
        releasedate: issueRecord.releasedate,
        price: issueRecord.price,
        currency: issueRecord.currency,
        series: series,
      };

      const publisherLabel = await generateLabel(publisher);
      const seriesLabel = await buildSeriesExportLabel(series);

      if (publisherLabel in response) {
        if (seriesLabel in response[publisherLabel])
          response[publisherLabel][seriesLabel].push(issueData);
        else {
          response[publisherLabel][seriesLabel] = [issueData];
        }
      } else {
        response[publisherLabel] = { [seriesLabel]: [issueData] };
      }
    });

    const sortedResponse: SortedExportResponse = Object.keys(response)
      .map((key) => {
        const publisherGroups = response[key];
        return [
          key,
          Object.keys(publisherGroups)
            .map((key) => {
              const issuesForSeries = publisherGroups[key];
              return [key, issuesForSeries.sort((a, b) => naturalCompare(a.number, b.number))] as [
                string,
                ExportIssueData[],
              ];
            })
            .sort((left, right) => alphaCompare(left[0], right[0])),
        ] as [string, Array<[string, ExportIssueData[]]>];
      })
      .sort((left, right) => alphaCompare(left[0], right[0]));

    if (type === 'txt') {
      return (
        'Anzahl Ergebnisse: ' +
        issues.length +
        '\n\n' +
        (await this.convertFilterToTxt(filter, loggedIn)) +
        (await this.resultsToTxt(sortedResponse))
      );
    } else if (type === 'csv') {
      return await this.resultsToCsv(sortedResponse, loggedIn);
    }
  }

  public async count(filter: Filter, loggedIn: boolean): Promise<number> {
    const options = this.getFilterOptions(loggedIn, filter);
    const count = await this.models.Issue.count({
      where: options.where,
      include: options.include,
      distinct: true,
      col: 'id',
    });
    return typeof count === 'number' ? count : 0;
  }

  public getFilterOptions(
    loggedIn: boolean,
    filter: Filter,
    isExport = false,
    orderField: string | boolean = false,
    sortDirection: string | boolean = false,
  ): FindOptions {
    type IncludeMap = {
      as?: string;
      include?: Includeable[];
      required?: boolean;
      where?: Record<string | symbol, unknown>;
    };

    const runtimeFilter = filter as RuntimeFilter;
    const us = Boolean(runtimeFilter.us);

    const where: WhereOptions = {};
    const andConditions: unknown[] = [];
    const appendAndCondition = (condition: unknown) => {
      andConditions.push(condition);
    };

    const include: Includeable[] = [
      {
        model: this.models.Series,
        as: 'series',
        required: true,
        include: [
          {
            model: this.models.Publisher,
            as: 'publisher',
            required: true,
            where: { original: us },
          },
        ],
      },
    ];

    const ensureInclude = (
      list: Includeable[],
      as: string,
      factory: () => Includeable,
    ): IncludeMap => {
      const existing = list.find((entry) => (entry as IncludeMap).as === as) as
        | IncludeMap
        | undefined;
      if (existing) {
        if (!Array.isArray(existing.include)) existing.include = [];
        return existing;
      }
      const created = factory() as IncludeMap;
      if (!Array.isArray(created.include)) created.include = [];
      list.push(created as Includeable);
      return created;
    };

    const ensureStoriesInclude = () =>
      ensureInclude(include, 'stories', () => ({
        model: this.models.Story,
        as: 'stories',
        required: true,
        include: [],
      }));

    if (runtimeFilter.formats && runtimeFilter.formats.length > 0) {
      appendAndCondition({ format: { [Op.in]: runtimeFilter.formats } });
    }

    if (runtimeFilter.releasedates && runtimeFilter.releasedates.length > 0) {
      runtimeFilter.releasedates.forEach((rd) => {
        if (!rd || !rd.date) return;
        const dateStr = dateFormat(new Date(rd.date), 'yyyy-mm-dd');
        const op =
          rd.compare === '>='
            ? Op.gte
            : rd.compare === '<='
              ? Op.lte
              : rd.compare === '>'
                ? Op.gt
                : rd.compare === '<'
                  ? Op.lt
                  : Op.eq;
        appendAndCondition({ releasedate: { [op]: dateStr } });
      });
    }

    if (!runtimeFilter.onlyCollected && runtimeFilter.withVariants) {
      appendAndCondition({ variant: { [Op.ne]: '' } });
    }

    if (runtimeFilter.onlyCollected) {
      appendAndCondition({ collected: true });
    }

    if (runtimeFilter.onlyNotCollected) {
      appendAndCondition({ collected: false });
    }

    if (runtimeFilter.onlyNotCollectedNoOwnedVariants) {
      const hasNoCollectedSiblingVariants = Sequelize.literal(
        'NOT EXISTS (SELECT 1 FROM "issue" AS i2 WHERE i2."fk_series" = "issue"."fk_series" AND i2."number" = "issue"."number" AND i2."collected" = TRUE)',
      );
      const formatRankSql = (tableAlias: string) =>
        `CASE LOWER(COALESCE(${tableAlias}."format", ''))
          WHEN 'heft' THEN 1
          WHEN 'softcover' THEN 2
          WHEN 'taschenbuch' THEN 3
          WHEN 'hardcover' THEN 4
          ELSE 5
        END`;
      const currentFormatRank = formatRankSql('"issue"');
      const siblingFormatRank = formatRankSql('i2');

      const isPreferredRepresentativeForUnownedGroup = Sequelize.literal(
        `NOT EXISTS (
          SELECT 1
          FROM "issue" AS i2
          WHERE i2."fk_series" = "issue"."fk_series"
            AND i2."number" = "issue"."number"
            AND i2."collected" = FALSE
            AND (
              (${siblingFormatRank}) < (${currentFormatRank})
              OR ((${siblingFormatRank}) = (${currentFormatRank}) AND i2."id" < "issue"."id")
            )
        )`,
      );

      appendAndCondition({
        [Op.and]: [
          { collected: false },
          hasNoCollectedSiblingVariants,
          isPreferredRepresentativeForUnownedGroup,
        ],
      });
    }

    // Story-based filters
    const storySwitchOrConditions: Array<Record<string, unknown>> = [];

    const appearanceTerms = Array.isArray(runtimeFilter.appearances)
      ? dedupeTerms(
          runtimeFilter.appearances
            .map((entry) => String(entry?.name || '').trim())
            .filter((entry) => entry.length > 0),
        )
      : splitFilterTerms(runtimeFilter.appearances as string | null | undefined);
    const realityTerms = Array.isArray(runtimeFilter.realities)
      ? dedupeTerms(
          runtimeFilter.realities
            .map((entry) => String(entry?.name || '').trim())
            .filter((entry) => entry.length > 0),
        )
      : splitFilterTerms(runtimeFilter.realities as string | null | undefined);
    let needsStoryIndividualJoin = false;
    let needsParentIndividualJoin = false;

    if (appearanceTerms.length > 0) {
      appendAndCondition({
        [Op.or]: appearanceTerms.flatMap((term) => {
          const conditions: Array<Record<string, unknown>> = [
            { '$stories.appearances.name$': { [Op.iLike]: `%${term}%` } },
            { '$stories.children.appearances.name$': { [Op.iLike]: `%${term}%` } },
          ];
          if (!us) {
            conditions.push({ '$stories.parent.appearances.name$': { [Op.iLike]: `%${term}%` } });
          }
          return conditions;
        }),
      });
    }

    if (realityTerms.length > 0) {
      appendAndCondition({
        [Op.or]: realityTerms.flatMap((term) => {
          const realityMarker = `(${term})`;
          const conditions: Array<Record<string, unknown>> = [
            { '$stories.appearances.name$': { [Op.iLike]: `%${realityMarker}%` } },
            { '$stories.children.appearances.name$': { [Op.iLike]: `%${realityMarker}%` } },
          ];
          if (!us) {
            conditions.push({
              '$stories.parent.appearances.name$': { [Op.iLike]: `%${realityMarker}%` },
            });
          }
          return conditions;
        }),
      });
    }

    if (runtimeFilter.individuals && runtimeFilter.individuals.length > 0) {
      const individualConditions = runtimeFilter.individuals
        .flatMap((ind) => {
          const name = typeof ind?.name === 'string' ? ind.name.trim() : '';
          if (!name) return [];

          const rawTypes = Array.isArray(ind?.type) ? ind.type : [];
          const normalizedTypes = dedupeTerms(
            rawTypes
              .filter((type): type is string => typeof type === 'string' && !!type)
              .map((type) => type.trim().toUpperCase()),
          );
          const nonTranslatorTypes = normalizedTypes.filter(
            (type) => type !== TRANSLATOR_STORY_INDIVIDUAL_TYPE,
          );
          const includesTranslatorType = normalizedTypes.includes(TRANSLATOR_STORY_INDIVIDUAL_TYPE);

          const buildStoryIndividualCondition = (types: string[]): Record<string, unknown> => {
            const condition: Record<string, unknown> = {
              '$stories.individuals.name$': name,
            };
            if (types.length > 0) {
              condition['$stories.individuals.story_individual.type$'] = { [Op.in]: types };
            }
            needsStoryIndividualJoin = true;
            return condition;
          };

          const buildParentStoryIndividualCondition = (types: string[]): Record<string, unknown> => {
            const condition: Record<string, unknown> = {
              '$stories.parent.individuals.name$': name,
            };
            if (types.length > 0) {
              condition['$stories.parent.individuals.story_individual.type$'] = { [Op.in]: types };
            }
            needsParentIndividualJoin = true;
            return condition;
          };

          const conditions: Array<Record<string, unknown>> = [];
          if (normalizedTypes.length === 0) {
            conditions.push(buildParentStoryIndividualCondition([]));
            conditions.push({
              [Op.and]: [{ '$stories.parent.id$': null }, buildStoryIndividualCondition([])],
            });
            return conditions;
          }

          if (nonTranslatorTypes.length > 0) {
            conditions.push(buildParentStoryIndividualCondition(nonTranslatorTypes));
            conditions.push({
              [Op.and]: [
                { '$stories.parent.id$': null },
                buildStoryIndividualCondition(nonTranslatorTypes),
              ],
            });
          }

          if (includesTranslatorType) {
            conditions.push(buildStoryIndividualCondition([TRANSLATOR_STORY_INDIVIDUAL_TYPE]));
          }

          return conditions;
        });

      if (individualConditions.length > 0) appendAndCondition({ [Op.or]: individualConditions });
    }

    if (runtimeFilter.firstPrint) storySwitchOrConditions.push({ '$stories.firstapp$': true });
    if (runtimeFilter.notFirstPrint) storySwitchOrConditions.push({ '$stories.firstapp$': false });
    if (runtimeFilter.exclusive) {
      if (us) {
        storySwitchOrConditions.push({ '$stories.exclusive$': true });
      } else {
        storySwitchOrConditions.push({ '$stories.parent.id$': null });
      }
    }
    if (runtimeFilter.notExclusive) {
      if (us) {
        storySwitchOrConditions.push({ '$stories.exclusive$': false });
      } else {
        storySwitchOrConditions.push({ '$stories.parent.id$': { [Op.ne]: null } });
      }
    }
    if (runtimeFilter.onlyPrint) storySwitchOrConditions.push({ '$stories.onlyapp$': true });
    if (runtimeFilter.notOnlyPrint) storySwitchOrConditions.push({ '$stories.onlyapp$': false });
    if (runtimeFilter.onlyTb) storySwitchOrConditions.push({ '$stories.onlytb$': true });
    if (runtimeFilter.notOnlyTb) storySwitchOrConditions.push({ '$stories.onlytb$': false });
    if (runtimeFilter.reprint) {
      const hasAnyStory = Sequelize.literal(
        'EXISTS (SELECT 1 FROM "story" AS s WHERE s."fk_issue" = "issue"."id")',
      );
      const hasNoFirstPrintStory = Sequelize.literal(
        'NOT EXISTS (SELECT 1 FROM "story" AS s WHERE s."fk_issue" = "issue"."id" AND s."firstapp" = TRUE)',
      );
      storySwitchOrConditions.push({ [Op.and]: [hasAnyStory, hasNoFirstPrintStory] });
    }
    if (runtimeFilter.notReprint) {
      const hasNoStories = Sequelize.literal(
        'NOT EXISTS (SELECT 1 FROM "story" AS s WHERE s."fk_issue" = "issue"."id")',
      );
      const hasAnyFirstPrintStory = Sequelize.literal(
        'EXISTS (SELECT 1 FROM "story" AS s WHERE s."fk_issue" = "issue"."id" AND s."firstapp" = TRUE)',
      );
      storySwitchOrConditions.push({ [Op.or]: [hasNoStories, hasAnyFirstPrintStory] });
    }
    if (runtimeFilter.otherOnlyTb) storySwitchOrConditions.push({ '$stories.otheronlytb$': true });
    if (runtimeFilter.notOtherOnlyTb)
      storySwitchOrConditions.push({ '$stories.otheronlytb$': false });
    if (runtimeFilter.noPrint)
      storySwitchOrConditions.push({ '$stories.firstapp$': false, '$stories.onlyapp$': false });
    if (runtimeFilter.notNoPrint)
      storySwitchOrConditions.push({
        [Op.or]: [{ '$stories.firstapp$': true }, { '$stories.onlyapp$': true }],
      });
    if (runtimeFilter.onlyOnePrint)
      storySwitchOrConditions.push({ '$stories.onlyoneprint$': true });
    if (runtimeFilter.notOnlyOnePrint)
      storySwitchOrConditions.push({ '$stories.onlyoneprint$': false });

    const needsStorySwitches = storySwitchOrConditions.length > 0;
    const needsAppearanceJoin = appearanceTerms.length > 0 || realityTerms.length > 0;
    const needsIndividualJoin = needsStoryIndividualJoin || needsParentIndividualJoin;
    const needsParentJoinForExclusive = Boolean(
      (runtimeFilter.exclusive || runtimeFilter.notExclusive) && !us,
    );

    if (
      needsStorySwitches ||
      needsAppearanceJoin ||
      needsIndividualJoin ||
      needsParentJoinForExclusive
    ) {
      const storyInclude = ensureStoriesInclude();
      storyInclude.required = true;

      if (needsAppearanceJoin) {
        ensureInclude(storyInclude.include || [], 'appearances', () => ({
          model: this.models.Appearance,
          as: 'appearances',
          required: false,
        }));

        if (!us) {
          const parentInclude = ensureInclude(storyInclude.include || [], 'parent', () => ({
            model: this.models.Story,
            as: 'parent',
            required: false,
            include: [],
          }));
          const parentNested = parentInclude.include || [];
          ensureInclude(parentNested, 'appearances', () => ({
            model: this.models.Appearance,
            as: 'appearances',
            required: false,
          }));
        }
      }

      if (needsStoryIndividualJoin) {
        ensureInclude(storyInclude.include || [], 'individuals', () => ({
          model: this.models.Individual,
          as: 'individuals',
          required: false,
        }));
      }

      if (needsParentIndividualJoin) {
        const parentInclude = ensureInclude(storyInclude.include || [], 'parent', () => ({
          model: this.models.Story,
          as: 'parent',
          required: false,
          include: [],
        }));
        const parentNested = parentInclude.include || [];
        ensureInclude(parentNested, 'individuals', () => ({
          model: this.models.Individual,
          as: 'individuals',
          required: false,
        }));
      }

      if (needsParentJoinForExclusive) {
        const parentInclude = ensureInclude(storyInclude.include || [], 'parent', () => ({
          model: this.models.Story,
          as: 'parent',
          required: false,
          include: [],
        }));
        parentInclude.required = false;
      }

      if (needsAppearanceJoin) {
        const childrenInclude = ensureInclude(storyInclude.include || [], 'children', () => ({
          model: this.models.Story,
          as: 'children',
          required: false,
          include: [],
        }));
        childrenInclude.required = false;
        const childInclude = childrenInclude.include || [];
        ensureInclude(childInclude, 'appearances', () => ({
          model: this.models.Appearance,
          as: 'appearances',
          required: false,
        }));
      }

      if (needsStorySwitches) appendAndCondition({ [Op.or]: storySwitchOrConditions });
    }

    const arcTerms = Array.isArray(runtimeFilter.arcs)
      ? dedupeTerms(
          runtimeFilter.arcs
            .map((entry) => String(entry?.title || '').trim())
            .filter((entry) => entry.length > 0),
        )
      : splitFilterTerms(runtimeFilter.arcs as string | null | undefined);

    if (arcTerms.length > 0) {
      const arcWhere =
        arcTerms.length === 1
          ? { title: { [Op.iLike]: `%${arcTerms[0]}%` } }
          : {
              [Op.or]: arcTerms.map((term) => ({
                title: { [Op.iLike]: `%${term}%` },
              })),
            };

      if (us) {
        const arcsInclude = ensureInclude(include, 'arcs', () => ({
          model: this.models.Arc,
          as: 'arcs',
          required: true,
          where: arcWhere,
          include: [],
        }));
        arcsInclude.required = true;
        arcsInclude.where = arcWhere;
      } else {
        const storiesInclude = ensureStoriesInclude();
        storiesInclude.required = true;
        const parentInclude = ensureInclude(storiesInclude.include || [], 'parent', () => ({
          model: this.models.Story,
          as: 'parent',
          required: true,
          include: [],
        }));
        parentInclude.required = true;

        const parentIssueInclude = ensureInclude(parentInclude.include || [], 'issue', () => ({
          model: this.models.Issue,
          as: 'issue',
          required: true,
          include: [],
        }));
        parentIssueInclude.required = true;

        const parentArcsInclude = ensureInclude(parentIssueInclude.include || [], 'arcs', () => ({
          model: this.models.Arc,
          as: 'arcs',
          required: true,
          where: arcWhere,
          include: [],
        }));
        parentArcsInclude.required = true;
        parentArcsInclude.where = arcWhere;
      }
    }

    if (runtimeFilter.publishers && runtimeFilter.publishers.length > 0) {
      const names = runtimeFilter.publishers
        .map((p) => p?.name)
        .filter((name): name is string => typeof name === 'string');
      const condition = { '$series.publisher.name$': { [Op.in]: names } };
      appendAndCondition(condition);
    }

    if (runtimeFilter.series && runtimeFilter.series.length > 0) {
      const conditions = runtimeFilter.series
        .filter((s) => !!s)
        .map((s) => {
          const title = typeof s?.title === 'string' ? s.title.trim() : '';
          const volume =
            typeof s?.volume === 'number' && Number.isFinite(s.volume) ? s.volume : undefined;
          if (!title || volume === undefined) return null;
          return {
            '$series.title$': title,
            '$series.volume$': volume,
          };
        })
        .filter((s): s is { '$series.title$': string; '$series.volume$': number } => Boolean(s));
      if (conditions.length > 0) appendAndCondition({ [Op.or]: conditions });
    }

    const genreTerms = (() => {
      const uniqueTerms = new Map<string, string>();
      (Array.isArray(runtimeFilter.genres) ? runtimeFilter.genres : []).forEach((genre) => {
        const value = typeof genre === 'string' ? genre.trim() : '';
        if (!value) return;

        const key = value.toLowerCase();
        if (!uniqueTerms.has(key)) uniqueTerms.set(key, value);
      });
      return [...uniqueTerms.values()];
    })();

    if (genreTerms.length > 0) {
      const normalizedSeriesGenreWithDelimiters = Sequelize.fn(
        'concat',
        ',',
        Sequelize.fn(
          'regexp_replace',
          Sequelize.fn('lower', Sequelize.fn('coalesce', Sequelize.col('series.genre'), '')),
          '\\s*,\\s*',
          ',',
          'g',
        ),
        ',',
      );

      appendAndCondition({
        [Op.or]: genreTerms.map((genre) =>
          Sequelize.where(normalizedSeriesGenreWithDelimiters, {
            [Op.like]: `%,${escapeLikeValue(genre.toLowerCase())},%`,
          }),
        ),
      });
    }

    if (runtimeFilter.numbers && runtimeFilter.numbers.length > 0) {
      runtimeFilter.numbers.forEach((n) => {
        if (!n || typeof n.number !== 'string') return;
        const op =
          n.compare === '>='
            ? Op.gte
            : n.compare === '<='
              ? Op.lte
              : n.compare === '>'
                ? Op.gt
                : n.compare === '<'
                  ? Op.lt
                  : Op.eq;

        const hasVariant = typeof n.variant === 'string' && n.variant.length > 0;
        const rawNumber = n.number.trim();

        if (op === Op.eq) {
          const equalConditions: Record<string, unknown>[] = [{ number: rawNumber }, { legacy_number: rawNumber }];
          if (hasVariant) {
            equalConditions.forEach((condition) => {
              condition.variant = n.variant;
            });
          }
          appendAndCondition({ [Op.or]: equalConditions });
          return;
        }

        let comparisonCondition: unknown;
        if (isNumericFilterValue(rawNumber)) {
          const numericIssueNumber = Sequelize.literal(
            `CASE WHEN "issue"."number" ~ '^[0-9]+(\\.[0-9]+)?$' THEN CAST("issue"."number" AS DECIMAL) END`,
          );
          const numericLegacyIssueNumber = Sequelize.literal(
            `CASE WHEN "issue"."legacy_number" ~ '^[0-9]+(\\.[0-9]+)?$' THEN CAST("issue"."legacy_number" AS DECIMAL) END`,
          );
          comparisonCondition = {
            [Op.or]: [
              Sequelize.where(numericIssueNumber, {
                [op]: Number(rawNumber),
              }),
              Sequelize.where(numericLegacyIssueNumber, {
                [op]: Number(rawNumber),
              }),
            ],
          };
        } else {
          comparisonCondition = {
            [Op.or]: [{ number: { [op]: rawNumber } }, { legacy_number: { [op]: rawNumber } }],
          };
        }

        if (hasVariant) {
          appendAndCondition({ [Op.and]: [comparisonCondition, { variant: n.variant }] });
          return;
        }
        appendAndCondition(comparisonCondition);
      });
    }

    if (runtimeFilter.noComicguideId) {
      appendAndCondition({
        [Op.or]: [{ comicguideid: '0' }, { comicguideid: 0 }, { comicguideid: null }],
      });
    }

    if (runtimeFilter.noContent) {
      if (!include.find((inc) => (inc as { as?: string }).as === 'stories')) {
        include.push({ model: this.models.Story, as: 'stories', required: false });
      }
      const condition = { '$stories.id$': null };
      appendAndCondition(condition);
    }

    if (andConditions.length > 0) {
      (where as Record<symbol, unknown>)[Op.and] = andConditions;
    }

    let order: Order = [];
    if (orderField) {
      order = [[String(orderField), String(sortDirection || 'ASC')]];
    } else if (isExport) {
      order = [
        [
          { model: this.models.Series, as: 'series' },
          { model: this.models.Publisher, as: 'publisher' },
          'name',
          'ASC',
        ],
        [{ model: this.models.Series, as: 'series' }, 'title', 'ASC'],
        [{ model: this.models.Series, as: 'series' }, 'volume', 'ASC'],
        ['number', 'ASC'],
      ];
    }

    return {
      where,
      include,
      order,
      subQuery: false, // Essential when using limit with includes
    };
  }

  private async resultsToCsv(results: SortedExportResponse, loggedIn: boolean) {
    let responseString =
      'Verlag;Series;Volume;Start;Ende;Nummer;Variante;Format;Seiten;Erscheinungsdaten;Preis;Währung\n';

    results.forEach((p) => {
      p[1].forEach((s) => {
        s[1].forEach((i) => {
          responseString +=
            i.series.publisher.name +
            '\t;' +
            i.series.title +
            '\t;' +
            i.series.volume +
            '\t;' +
            i.series.startyear +
            '\t;' +
            i.series.endyear +
            '\t;' +
            i.number +
            '\t;' +
            i.variant +
            '\t;' +
            i.format +
            '\t;' +
            i.pages +
            '\t;' +
            i.releasedate +
            '\t;' +
            (i.price + '').replace('.', ',') +
            '\t;' +
            i.currency +
            '\n';
        });
      });
    });

    return responseString;
  }

  private async resultsToTxt(results: SortedExportResponse) {
    let responseString = '';

    results.forEach((p) => {
      responseString += p[0] + '\n';
      p[1].forEach((s) => {
        responseString += '\t' + s[0] + '\n';
        s[1].forEach((i) => {
          responseString += '\t\t#' + i.number + '\n';
        });
      });
      responseString += '\n';
    });

    return responseString;
  }

  private async convertFilterToTxt(filter: Filter, loggedIn: boolean) {
    const runtimeFilter = filter as RuntimeFilter;
    let s = 'Aktive Filter\n';
    s += '\t' + (runtimeFilter.us ? 'Original Ausgaben' : 'Deutsche Ausgaben') + '\n';
    s += '\tDetails\n';

    if (runtimeFilter.formats) {
      s += '\t\tFormat: ';
      runtimeFilter.formats.forEach((f: string | null) => (s += (f || '') + ', '));
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (runtimeFilter.withVariants) s += '\t\tmit Varianten\n';

    if (runtimeFilter.releasedates) {
      s += '\t\tErscheinungsdatum: ';
      runtimeFilter.releasedates.forEach((r) => {
        if (r?.date) s += dateFormat(new Date(r.date), 'dd.mm.yyyy') + ' ' + r.compare + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (!runtimeFilter.formats && !runtimeFilter.withVariants && !runtimeFilter.releasedates)
      s += '\t\t-\n';
    if (runtimeFilter.noComicguideId) s += '\tOhne Comicguide ID\n';
    if (runtimeFilter.noContent) s += '\tOhne Inhalt\n';

    s += '\tEnthält\n';
    if (runtimeFilter.firstPrint) s += '\t\tErstausgabe\n';
    if (runtimeFilter.notFirstPrint) s += '\t\tNicht Erstausgabe\n';
    if (runtimeFilter.onlyPrint) s += '\t\tEinzige Ausgabe\n';
    if (runtimeFilter.notOnlyPrint) s += '\t\tNicht einzige Ausgabe\n';
    if (runtimeFilter.onlyTb) s += '\t\tNur in TB\n';
    if (runtimeFilter.notOnlyTb) s += '\t\tNicht nur in TB\n';
    if (runtimeFilter.exclusive) s += '\t\tExclusiv\n';
    if (runtimeFilter.notExclusive) s += '\t\tNicht exklusiv\n';
    if (runtimeFilter.reprint) s += '\t\tReiner Nachdruck\n';
    if (runtimeFilter.notReprint) s += '\t\tNicht reiner Nachdruck\n';
    if (runtimeFilter.otherOnlyTb) s += '\t\tNur in TB\n';
    if (runtimeFilter.notOtherOnlyTb) s += '\t\tNicht sonst nur in TB\n';
    if (runtimeFilter.noPrint) s += '\t\tKeine Ausgabe\n';
    if (runtimeFilter.notNoPrint) s += '\t\tMindestens eine Ausgabe\n';
    if (runtimeFilter.onlyOnePrint) s += '\t\tEinzige Ausgabe\n';
    if (runtimeFilter.notOnlyOnePrint) s += '\t\tNicht nur einmal erschienen\n';
    if (runtimeFilter.onlyCollected) s += '\t\tGesammelt\n';
    if (runtimeFilter.onlyNotCollected) s += '\t\tNicht gesammelt\n';
    if (runtimeFilter.onlyNotCollectedNoOwnedVariants)
      s += '\t\tNicht gesammelt (keine Variante gesammelt)\n';

    if (runtimeFilter.publishers) {
      s += '\tVerlag: ';
      runtimeFilter.publishers.forEach((p) => {
        if (p?.name) s += p.name + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (runtimeFilter.series) {
      s += '\tSerie: ';
      runtimeFilter.series.forEach((n) => {
        if (n?.title && n?.volume) s += n.title + ' (Vol. ' + n.volume + '), ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (runtimeFilter.genres && runtimeFilter.genres.length > 0) {
      const genres = dedupeTerms(
        runtimeFilter.genres
          .map((genre) => (typeof genre === 'string' ? genre.trim() : ''))
          .filter((genre) => genre.length > 0),
      );
      if (genres.length > 0) s += '\tGenre: ' + genres.join(', ') + '\n';
    }

    if (runtimeFilter.numbers) {
      s += '\tNummer: ';
      runtimeFilter.numbers.forEach((n) => {
        if (!n) return;
        s += '#' + n.number;
        if (n.variant) s += ' (' + n.variant + ')';
        s += ' ' + n.compare + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (Array.isArray(runtimeFilter.arcs) && runtimeFilter.arcs.length > 0) {
      s += '\tStory Arc: ';
      runtimeFilter.arcs.forEach((arc) => {
        if (arc?.title) s += arc.title + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (runtimeFilter.individuals) {
      s += '\tMitwirkende: ';
      runtimeFilter.individuals.forEach((i) => {
        if (i?.name) s += i.name + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (Array.isArray(runtimeFilter.appearances) && runtimeFilter.appearances.length > 0) {
      s += '\tAuftritte: ';
      runtimeFilter.appearances.forEach((appearance) => {
        if (appearance?.name) s += appearance.name + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (Array.isArray(runtimeFilter.realities) && runtimeFilter.realities.length > 0) {
      s += '\tRealität: ';
      runtimeFilter.realities.forEach((reality) => {
        if (reality?.name) s += reality.name + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    return s;
  }
}
