import { FindOptions, Op, Order, ProjectionAlias, Sequelize, WhereOptions } from 'sequelize';
import models from '../models';
import { naturalCompare, generateLabel, asyncForEach } from '../util/util';
import { GraphQLError } from 'graphql';
import { Filter } from '../types/graphql';
import logger from '../util/logger';
const dateFormat = require('dateformat');

export class FilterService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: string = 'info') {
    (logger as any)[level](message, { requestId: this.requestId });
  }

  public async export(filter: Filter, type: string, loggedIn: boolean) {
    const options = this.getFilterOptions(loggedIn, filter, true);
    options.limit = 1000; // Export limit
    const issues = await this.models.Issue.findAll(options);

    let response: any = {};
    await asyncForEach(issues, async (issue: any) => {
      const p = issue.Series.Publisher;
      const s = issue.Series;

      let publisher = { name: p.name };
      let series = {
        title: s.title,
        volume: s.volume,
        startyear: s.startyear,
        endyear: s.endyear,
        publisher: publisher,
      };
      let issueData = {
        number: issue.number,
        format: issue.format,
        variant: issue.variant,
        pages: issue.pages,
        releasedate: issue.releasedate,
        price: issue.price,
        currency: issue.currency,
        series: series,
      };

      let publisherLabel = await generateLabel(publisher);
      let seriesLabel = await generateLabel(series);

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

    let sortedResponse = Object.keys(response)
      .map((key) => {
        let p = response[key];
        return [
          key,
          Object.keys(p)
            .map((key) => {
              let s = p[key];
              return [
                key,
                s.sort((a: any, b: any) => naturalCompare(a.number, b.number)),
              ];
            })
            .sort(),
        ];
      })
      .sort();

    if (type === 'txt') {
      return JSON.stringify(
        (await this.convertFilterToTxt(filter, loggedIn)) + (await this.resultsToTxt(sortedResponse)),
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
    const include: any[] = [
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
      filter.releasedates.forEach((rd: any) => {
        const dateStr = dateFormat(new Date(rd.date), 'yyyy-mm-dd');
        const op = rd.compare === '>=' ? Op.gte : rd.compare === '<=' ? Op.lte : rd.compare === '>' ? Op.gt : rd.compare === '<' ? Op.lt : Op.eq;
        where.releasedate = { ...((where.releasedate as any) || {}), [op]: dateStr };
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
      where.format = { ...((where.format as any) || {}), [Op.ne]: 'Digital' };
    }

    // Story-based filters
    const storyConditions: any[] = [];
    if (filter.appearances) {
      storyConditions.push({
        [Op.or]: [
          { '$Stories.Appearances.name$': { [Op.like]: `%${filter.appearances}%` } },
          { '$Stories.Children.Appearances.name$': { [Op.like]: `%${filter.appearances}%` } },
        ],
      });
    }

    if (filter.individuals && filter.individuals.length > 0) {
      const names = filter.individuals.map((ind: any) => ind.name);
      storyConditions.push({
        [Op.or]: [
          { '$Stories.Individuals.name$': { [Op.in]: names } },
          { '$Stories.Children.Individuals.name$': { [Op.in]: names } },
        ],
      });
    }

    if (filter.firstPrint) storyConditions.push({ '$Stories.firstapp$': true });
    if (filter.exclusive) storyConditions.push({ '$Stories.firstapp$': true, '$Stories.onlyapp$': true });
    if (filter.onlyPrint) storyConditions.push({ '$Stories.onlyapp$': true });
    if (filter.onlyTb) storyConditions.push({ '$Stories.onlytb$': true });
    if (filter.reprint) storyConditions.push({ '$Stories.fk_reprint$': { [Op.ne]: null } });
    if (filter.otherOnlyTb) storyConditions.push({ '$Stories.otheronlytb$': true });
    if (filter.noPrint) storyConditions.push({ '$Stories.firstapp$': false, '$Stories.onlyapp$': false });
    if (filter.onlyOnePrint) storyConditions.push({ '$Stories.onlyoneprint$': true });

    if (storyConditions.length > 0) {
      const storyInclude: any = {
        model: this.models.Story,
        as: 'Stories',
        required: true,
        include: [],
      };
      if (filter.appearances || filter.individuals) {
        storyInclude.include.push({ model: this.models.Appearance, as: 'Appearances', required: false });
        storyInclude.include.push({ model: this.models.Individual, as: 'Individuals', required: false });
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

      if (filter.and) {
        where[Op.and as any] = [...((where[Op.and as any] as any[]) || []), ...storyConditions];
      } else {
        where[Op.or as any] = [...((where[Op.or as any] as any[]) || []), ...storyConditions];
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
      const names = filter.publishers.map((p: any) => p.name);
      const condition = { '$Series.Publisher.name$': { [Op.in]: names } };
      if (filter.and) where[Op.and as any] = [...((where[Op.and as any] as any[]) || []), condition];
      else where[Op.or as any] = [...((where[Op.or as any] as any[]) || []), condition];
    }

    if (filter.series && filter.series.length > 0) {
      const conditions = filter.series.map((s: any) => ({
        '$Series.title$': s.title,
        '$Series.volume$': s.volume,
      }));
      if (filter.and) where[Op.and as any] = [...((where[Op.and as any] as any[]) || []), { [Op.or]: conditions }];
      else where[Op.or as any] = [...((where[Op.or as any] as any[]) || []), ...conditions];
    }

    if (filter.numbers && filter.numbers.length > 0) {
      const conditions = filter.numbers.map((n: any) => {
        const op = n.compare === '>=' ? Op.gte : n.compare === '<=' ? Op.lte : n.compare === '>' ? Op.gt : n.compare === '<' ? Op.lt : Op.eq;
        const cond: any = { number: { [op]: n.number } };
        if (n.variant) cond.variant = n.variant;
        return cond;
      });
      if (filter.and) where[Op.and as any] = [...((where[Op.and as any] as any[]) || []), { [Op.or]: conditions }];
      else where[Op.or as any] = [...((where[Op.or as any] as any[]) || []), ...conditions];
    }

    if (filter.noCover) {
      include.push({
        model: this.models.Cover,
        as: 'Covers',
        required: false,
      });
      const condition = { '$Covers.id$': null };
      if (filter.and) where[Op.and as any] = [...((where[Op.and as any] as any[]) || []), condition];
      else where[Op.or as any] = [...((where[Op.or as any] as any[]) || []), condition];
    }

    if (filter.noContent) {
      if (!include.find((inc: any) => inc.as === 'Stories')) {
        include.push({ model: this.models.Story, as: 'Stories', required: false });
      }
      const condition = { '$Stories.id$': null };
      if (filter.and) where[Op.and as any] = [...((where[Op.and as any] as any[]) || []), condition];
      else where[Op.or as any] = [...((where[Op.or as any] as any[]) || []), condition];
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

  private async resultsToCsv(results: any[], loggedIn: boolean) {
    let responseString =
      'Verlag;Series;Volume;Start;Ende;Nummer;Variante;Format;Seiten;Erscheinungsdaten;Preis;Währung\n';

    results.forEach((p) => {
      p[1].forEach((s: any) => {
        s[1].forEach((i: any) => {
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

  private async resultsToTxt(results: any[]) {
    let responseString = '';

    results.forEach((p) => {
      responseString += p[0] + '\n';
      p[1].forEach((s: any) => {
        responseString += '\t' + s[0] + '\n';
        s[1].forEach((i: any) => {
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
      filter.releasedates.forEach(
        (r: any) => (s += dateFormat(new Date(r.date), 'dd.mm.yyyy') + ' ' + r.compare + ', '),
      );
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
      filter.publishers.forEach((p: any) => (s += p.name + ', '));
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.series) {
      s += '\tSerie: ';
      filter.series.forEach((n: any) => (s += n.title + ' (Vol. ' + n.volume + '), '));
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.numbers) {
      s += '\tNummer: ';
      filter.numbers.forEach((n: any) => {
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
      filter.individuals.forEach((i: any) => (s += i.name + ', '));
      s = s.substr(0, s.length - 2) + '\n';
    }

    if (filter.appearances) {
      s += '\tAuftritte: ' + filter.appearances + '\n';
    }

    return s;
  }
}
