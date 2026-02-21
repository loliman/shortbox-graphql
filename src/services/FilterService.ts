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

const splitFilterTerms = (value: string | null | undefined): string[] => {
  if (!value) return [];
  return value
    .split(MULTI_FILTER_SEPARATOR_REGEX)
    .map((entry) => entry.trim())
    .filter((entry, index, arr) => entry.length > 0 && arr.indexOf(entry) === index);
};

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

    const us = Boolean(filter.us);

    const where: WhereOptions = {};
    const conditionOperator = filter.and ? Op.and : Op.or;
    const appendCondition = (condition: Record<string | symbol, unknown>) => {
      const whereWithSymbols = where as Record<symbol, unknown>;
      const current = Array.isArray(whereWithSymbols[conditionOperator])
        ? (whereWithSymbols[conditionOperator] as unknown[])
        : [];
      whereWithSymbols[conditionOperator] = [...current, condition];
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
      const existing = list.find((entry) => (entry as IncludeMap).as === as) as IncludeMap | undefined;
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

    if (filter.formats && filter.formats.length > 0) {
      appendCondition({ format: { [Op.in]: filter.formats } });
    }

    if (filter.releasedates && filter.releasedates.length > 0) {
      filter.releasedates.forEach((rd) => {
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
        appendCondition({ releasedate: { [op]: dateStr } });
      });
    }

    if (!filter.onlyCollected && filter.withVariants) {
      appendCondition({ variant: { [Op.ne]: '' } });
    }

    if (filter.onlyCollected) {
      appendCondition({ collected: true });
    }

    if (filter.onlyNotCollected) {
      appendCondition({ collected: false });
    }

    if (filter.sellable) {
      appendCondition({ format: { [Op.ne]: 'Digital' } });
    }

    // Story-based filters
    const storyConditions: Array<Record<string, unknown>> = [];
    const appearanceTerms = splitFilterTerms(filter.appearances);
    if (appearanceTerms.length > 0) {
      storyConditions.push({
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

    if (filter.individuals && filter.individuals.length > 0) {
      const individualConditions = filter.individuals
        .flatMap((ind) => {
          const name = typeof ind?.name === 'string' ? ind.name : '';
          if (!name) return [];

          const rawTypes = Array.isArray(ind?.type) ? ind.type : [];
          const types = rawTypes.filter((type): type is string => typeof type === 'string' && !!type);

          const storyIndividualCondition: Record<string, unknown> = {
            '$stories.individuals.name$': name,
          };
          const childStoryIndividualCondition: Record<string, unknown> = {
            '$stories.children.individuals.name$': name,
          };

          if (types.length > 0) {
            storyIndividualCondition['$stories.individuals.story_individual.type$'] = {
              [Op.in]: types,
            };
            childStoryIndividualCondition['$stories.children.individuals.story_individual.type$'] =
              { [Op.in]: types };
          }

          return [storyIndividualCondition, childStoryIndividualCondition];
        })
        .filter((condition) => Object.keys(condition).length > 0);

      if (individualConditions.length > 0) {
        storyConditions.push({
          [Op.or]: individualConditions,
        });
      }
    }

    if (filter.firstPrint) storyConditions.push({ '$stories.firstapp$': true });
    if (filter.exclusive)
      storyConditions.push({ '$stories.firstapp$': true, '$stories.onlyapp$': true });
    if (filter.onlyPrint) storyConditions.push({ '$stories.onlyapp$': true });
    if (filter.onlyTb) storyConditions.push({ '$stories.onlytb$': true });
    if (filter.reprint) storyConditions.push({ '$stories.fk_reprint$': { [Op.ne]: null } });
    if (filter.otherOnlyTb) storyConditions.push({ '$stories.otheronlytb$': true });
    if (filter.noPrint)
      storyConditions.push({ '$stories.firstapp$': false, '$stories.onlyapp$': false });
    if (filter.onlyOnePrint) storyConditions.push({ '$stories.onlyoneprint$': true });

    if (storyConditions.length > 0) {
      const storyInclude = ensureStoriesInclude();
      storyInclude.required = true;
      const needsAppearanceJoin = Boolean(filter.appearances);
      const needsIndividualJoin = Boolean(filter.individuals && filter.individuals.length > 0);

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

      if (needsIndividualJoin) {
        ensureInclude(storyInclude.include || [], 'individuals', () => ({
          model: this.models.Individual,
          as: 'individuals',
          required: false,
        }));
      }

      if (needsAppearanceJoin || needsIndividualJoin) {
        const childrenInclude = ensureInclude(storyInclude.include || [], 'children', () => ({
          model: this.models.Story,
          as: 'children',
          required: false,
          include: [],
        }));
        childrenInclude.required = false;
        const childInclude = childrenInclude.include || [];
        if (needsAppearanceJoin) {
          ensureInclude(childInclude, 'appearances', () => ({
            model: this.models.Appearance,
            as: 'appearances',
            required: false,
          }));
        }
        if (needsIndividualJoin) {
          ensureInclude(childInclude, 'individuals', () => ({
            model: this.models.Individual,
            as: 'individuals',
            required: false,
          }));
        }
      }

      storyConditions.forEach((condition) => appendCondition(condition));
    }

    const arcTerms = splitFilterTerms(filter.arcs);
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

    if (filter.publishers && filter.publishers.length > 0) {
      const names = filter.publishers
        .map((p) => p?.name)
        .filter((name): name is string => typeof name === 'string');
      const condition = { '$series.publisher.name$': { [Op.in]: names } };
      appendCondition(condition);
    }

    if (filter.series && filter.series.length > 0) {
      const conditions = filter.series
        .filter((s) => !!s)
        .map((s) => ({
          '$series.title$': s?.title,
          '$series.volume$': s?.volume,
        }));
      appendCondition({ [Op.or]: conditions });
    }

    if (filter.numbers && filter.numbers.length > 0) {
      const conditions = filter.numbers
        .map((n) => {
          if (!n) return null;
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
          const cond: Record<string, unknown> = { number: { [op]: n.number } };
          if (n.variant) cond.variant = n.variant;
          return cond;
        })
        .filter((cond): cond is Record<string, unknown> => cond !== null);
      appendCondition({ [Op.or]: conditions });
    }

    if (filter.noCover) {
      include.push({
        model: this.models.Cover,
        as: 'covers',
        required: false,
      });
      const condition = { '$covers.id$': null };
      appendCondition(condition);
    }

    if (filter.noContent) {
      if (!include.find((inc) => (inc as { as?: string }).as === 'stories')) {
        include.push({ model: this.models.Story, as: 'stories', required: false });
      }
      const condition = { '$stories.id$': null };
      appendCondition(condition);
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
    let s = 'Aktive Filter\n';
    s += '\t' + (filter.us ? 'Original Ausgaben' : 'Deutsche Ausgaben') + '\n';
    s += '\tDetails\n';

    if (filter.formats) {
      s += '\t\tFormat: ';
      filter.formats.forEach((f: string | null) => (s += (f || '') + ', '));
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.withVariants) s += '\t\tmit Varianten\n';

    if (filter.releasedates) {
      s += '\t\tErscheinungsdatum: ';
      filter.releasedates.forEach((r) => {
        if (r?.date) s += dateFormat(new Date(r.date), 'dd.mm.yyyy') + ' ' + r.compare + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (!filter.formats && !filter.withVariants && !filter.releasedates) s += '\t\t-\n';
    if (filter.and) s += '\tAlle Kriterien müssen erfüllt sein\n';
    if (filter.noCover) s += '\tOhne Cover\n';
    if (filter.noContent) s += '\tOhne Inhalt\n';

    s += '\tEnthält\n';
    if (filter.firstPrint) s += '\t\tErstausgabe\n';
    if (filter.onlyPrint) s += '\t\tEinzige Ausgabe\n';
    if (filter.onlyTb) s += '\t\tNur in TB\n';
    if (filter.exclusive) s += '\t\tExclusiv\n';
    if (filter.reprint) s += '\t\tReiner Nachdruck\n';
    if (filter.otherOnlyTb) s += '\t\tNur in TB\n';
    if (filter.noPrint) s += '\t\tKeine Ausgabe\n';
    if (filter.onlyOnePrint) s += '\t\tEinzige Ausgabe\n';
    if (filter.onlyCollected) s += '\t\tGesammelt\n';
    if (filter.onlyNotCollected) s += '\t\tNicht gesammelt\n';
    if (filter.sellable) s += '\t\tVerkaufbar\n';

    if (filter.publishers) {
      s += '\tVerlag: ';
      filter.publishers.forEach((p) => {
        if (p?.name) s += p.name + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.series) {
      s += '\tSerie: ';
      filter.series.forEach((n) => {
        if (n?.title && n?.volume) s += n.title + ' (Vol. ' + n.volume + '), ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.numbers) {
      s += '\tNummer: ';
      filter.numbers.forEach((n) => {
        if (!n) return;
        s += '#' + n.number;
        if (n.variant) s += ' (' + n.variant + ')';
        s += ' ' + n.compare + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.arcs) {
      s += '\tStory Arc: ' + filter.arcs + '\n';
    }

    if (filter.individuals) {
      s += '\tMitwirkende: ';
      filter.individuals.forEach((i) => {
        if (i?.name) s += i.name + ', ';
      });
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.appearances) {
      s += '\tAuftritte: ' + filter.appearances + '\n';
    }

    return s;
  }
}
