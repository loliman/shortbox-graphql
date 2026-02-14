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
  Series: {
    title: string;
    volume: number;
    startyear: number;
    endyear: number;
    Publisher: {
      name: string;
    };
  };
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
    const options = this.getFilterOptions(loggedIn, filter, true);
    options.limit = 1000; // Export limit
    const issues = await this.models.Issue.findAll(options);

    const response: ExportResponse = {};
    await asyncForEach(issues, async (issue) => {
      const issueRecord = issue as unknown as ExportIssueRecord;
      const p = issueRecord.Series.Publisher;
      const s = issueRecord.Series;

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
      const seriesLabel = await generateLabel(series);

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
            .sort(),
        ] as [string, Array<[string, ExportIssueData[]]>];
      })
      .sort();

    if (type === 'txt') {
      return JSON.stringify(
        (await this.convertFilterToTxt(filter, loggedIn)) +
          (await this.resultsToTxt(sortedResponse)),
      );
    } else if (type === 'csv') {
      return JSON.stringify(await this.resultsToCsv(sortedResponse, loggedIn));
    } else {
      throw new GraphQLError('Gültige Export Typen: txt, csv', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }
  }

  public getFilterOptions(
    loggedIn: boolean,
    filter: Filter,
    isExport = false,
    orderField: string | boolean = false,
    sortDirection: string | boolean = false,
  ): FindOptions {
    const us = filter.us ? 1 : 0;

    const where: WhereOptions = {};
    const include: Includeable[] = [
      {
        model: this.models.Series,
        required: true,
        include: [
          {
            model: this.models.Publisher,
            required: true,
            where: { original: us },
          },
        ],
      },
    ];

    if (filter.formats && filter.formats.length > 0) {
      where.format = { [Op.in]: filter.formats };
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
        const releaseDateWhere = (where.releasedate || {}) as Record<string | symbol, unknown>;
        where.releasedate = { ...releaseDateWhere, [op]: dateStr };
      });
    }

    if (!filter.onlyCollected && filter.withVariants) {
      where.variant = { [Op.ne]: '' };
    }

    if (filter.onlyCollected) {
      where.collected = true;
    }

    if (filter.onlyNotCollected) {
      where.collected = false;
    }

    if (filter.sellable) {
      const formatWhere = (where.format || {}) as Record<string | symbol, unknown>;
      where.format = { ...formatWhere, [Op.ne]: 'Digital' };
    }

    // Story-based filters
    const storyConditions: Array<Record<string, unknown>> = [];
    if (filter.appearances) {
      storyConditions.push({
        [Op.or]: [
          { '$Stories.Appearances.name$': { [Op.like]: `%${filter.appearances}%` } },
          { '$Stories.Children.Appearances.name$': { [Op.like]: `%${filter.appearances}%` } },
        ],
      });
    }

    if (filter.individuals && filter.individuals.length > 0) {
      const names = filter.individuals
        .map((ind) => ind?.name)
        .filter((name): name is string => typeof name === 'string');
      storyConditions.push({
        [Op.or]: [
          { '$Stories.Individuals.name$': { [Op.in]: names } },
          { '$Stories.Children.Individuals.name$': { [Op.in]: names } },
        ],
      });
    }

    if (filter.firstPrint) storyConditions.push({ '$Stories.firstapp$': true });
    if (filter.exclusive)
      storyConditions.push({ '$Stories.firstapp$': true, '$Stories.onlyapp$': true });
    if (filter.onlyPrint) storyConditions.push({ '$Stories.onlyapp$': true });
    if (filter.onlyTb) storyConditions.push({ '$Stories.onlytb$': true });
    if (filter.reprint) storyConditions.push({ '$Stories.fk_reprint$': { [Op.ne]: null } });
    if (filter.otherOnlyTb) storyConditions.push({ '$Stories.otheronlytb$': true });
    if (filter.noPrint)
      storyConditions.push({ '$Stories.firstapp$': false, '$Stories.onlyapp$': false });
    if (filter.onlyOnePrint) storyConditions.push({ '$Stories.onlyoneprint$': true });

    if (storyConditions.length > 0) {
      const storyInclude = {
        model: this.models.Story,
        as: 'Stories',
        required: true,
        include: [] as Includeable[],
      };
      if (filter.appearances || filter.individuals) {
        storyInclude.include.push({
          model: this.models.Appearance,
          as: 'Appearances',
          required: false,
        });
        storyInclude.include.push({
          model: this.models.Individual,
          as: 'Individuals',
          required: false,
        });
        storyInclude.include.push({
          model: this.models.Story,
          as: 'Children',
          required: false,
          include: [
            { model: this.models.Appearance, as: 'Appearances', required: false },
            { model: this.models.Individual, as: 'Individuals', required: false },
          ],
        });
      }
      include.push(storyInclude);

      const whereWithSymbols = where as Record<symbol, unknown>;
      if (filter.and) {
        const current = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [...current, ...storyConditions];
      } else {
        const current = Array.isArray(whereWithSymbols[Op.or])
          ? (whereWithSymbols[Op.or] as unknown[])
          : [];
        whereWithSymbols[Op.or] = [...current, ...storyConditions];
      }
    }

    if (filter.arcs) {
      include.push({
        model: this.models.Arc,
        as: 'Arcs',
        required: true,
        where: { title: { [Op.like]: `%${filter.arcs}%` } },
      });
    }

    if (filter.publishers && filter.publishers.length > 0) {
      const names = filter.publishers
        .map((p) => p?.name)
        .filter((name): name is string => typeof name === 'string');
      const condition = { '$Series.Publisher.name$': { [Op.in]: names } };
      const whereWithSymbols = where as Record<symbol, unknown>;
      if (filter.and) {
        const current = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [...current, condition];
      } else {
        const current = Array.isArray(whereWithSymbols[Op.or])
          ? (whereWithSymbols[Op.or] as unknown[])
          : [];
        whereWithSymbols[Op.or] = [...current, condition];
      }
    }

    if (filter.series && filter.series.length > 0) {
      const conditions = filter.series
        .filter((s) => !!s)
        .map((s) => ({
          '$Series.title$': s?.title,
          '$Series.volume$': s?.volume,
        }));
      const whereWithSymbols = where as Record<symbol, unknown>;
      if (filter.and) {
        const current = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [...current, { [Op.or]: conditions }];
      } else {
        const current = Array.isArray(whereWithSymbols[Op.or])
          ? (whereWithSymbols[Op.or] as unknown[])
          : [];
        whereWithSymbols[Op.or] = [...current, ...conditions];
      }
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
      const whereWithSymbols = where as Record<symbol, unknown>;
      if (filter.and) {
        const current = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [...current, { [Op.or]: conditions }];
      } else {
        const current = Array.isArray(whereWithSymbols[Op.or])
          ? (whereWithSymbols[Op.or] as unknown[])
          : [];
        whereWithSymbols[Op.or] = [...current, ...conditions];
      }
    }

    if (filter.noCover) {
      include.push({
        model: this.models.Cover,
        as: 'Covers',
        required: false,
      });
      const condition = { '$Covers.id$': null };
      const whereWithSymbols = where as Record<symbol, unknown>;
      if (filter.and) {
        const current = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [...current, condition];
      } else {
        const current = Array.isArray(whereWithSymbols[Op.or])
          ? (whereWithSymbols[Op.or] as unknown[])
          : [];
        whereWithSymbols[Op.or] = [...current, condition];
      }
    }

    if (filter.noContent) {
      if (!include.find((inc) => (inc as { as?: string }).as === 'Stories')) {
        include.push({ model: this.models.Story, as: 'Stories', required: false });
      }
      const condition = { '$Stories.id$': null };
      const whereWithSymbols = where as Record<symbol, unknown>;
      if (filter.and) {
        const current = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [...current, condition];
      } else {
        const current = Array.isArray(whereWithSymbols[Op.or])
          ? (whereWithSymbols[Op.or] as unknown[])
          : [];
        whereWithSymbols[Op.or] = [...current, condition];
      }
    }

    let order: Order = [];
    if (orderField) {
      order = [[String(orderField), String(sortDirection || 'ASC')]];
    } else if (isExport) {
      order = [
        ['$Series.Publisher.name$', 'ASC'],
        ['$Series.title$', 'ASC'],
        ['$Series.volume$', 'ASC'],
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
