import {Series} from '../database/Series';
import {Issue} from '../database/Issue';
import {raw, Transaction} from 'objection';
import {asyncForEach} from '../util/util';
import {Story} from '../database/Story';
import {Publisher} from '../database/Publisher';
import {Individual} from '../database/Individual';
import {Arc} from '../database/Arc';
import {Appearance} from '../database/Appearance';
import {knex} from '../core/database';
import {MarvelFandomCrawler} from '../core/crawler/MarvelFandomCrawler';

export class IssueService {
  async getIssues(
    series: Series,
    offset: number,
    filter: string
  ): Promise<Issue[]> {
    let query;

    if (!filter) query = await IssueService.getIssuesNoFilter(series, offset);
    else query = await IssueService.getIssuesWithFilter(series, offset, filter);

    return query;
  }

  private static async getIssuesNoFilter(
    series: Series,
    offset: number
  ): Promise<Issue[]> {
    const publisher = await series.publisher;

    return Issue.query()
      .select(
        'issue.*',
        raw('cast(number as unsigned) as numberasint'),
        raw('fromRoman(number) as numberfromroman'),
        'number',
        'releasedate',
        'fk_series'
      )
      .min('issue.title as title')
      .min('format as format')
      .min('variant as variant')
      .leftJoinRelated('[series.publisher]')
      .where('series.title', series.title)
      .where('series.volume', series.volume)
      .where('name', publisher.name)
      .where('us', publisher.us ? 1 : 0)
      .orderBy([
        'numberasint',
        'numberfromroman',
        'releasedate',
        'number',
        {column: 'variant', order: 'desc'},
        {column: 'title', order: 'desc'},
        {column: 'format', order: 'desc'},
      ])
      .groupBy(['fk_series', 'number'])
      .offset(offset)
      .limit(50)
      .withGraphFetched('series.[publisher]');
  }

  private static getIssuesWithFilter(
    series: Series,
    offset: number,
    filter: string
  ): Promise<Issue[]> {
    //TODO
    /*
                 let rawQuery = createFilterQuery(series, filter, offset);
            let res = await models.sequelize.query(rawQuery);
            let issues = [];
            res[0].forEach(i =>
                issues.push({
                    number: i.issuenumber,
                    fk_series: i.seriesid,
                    format: i.issueformat,
                    variant: i.issuevariant,
                })
            );
            return issues.sort((a, b) => naturalCompare(a.number, b.number));
      */
    return new Promise<Issue[]>(() => []);
  }

  async getIssueDetails(issue: Issue, edit: boolean): Promise<Issue> {
    return Issue.query()
      .leftJoinRelated('[arcs, individuals, features, cover, series, stories]')
      .where('issue.id', issue.id)
      .first()
      .withGraphFetched(
        '[arcs, individuals, features.[individuals], cover, series.[publisher],' +
          'stories.[reprintOf.[issue.[series.[publisher]]],reprints.[issue.[series.[publisher]]],individuals,appearances,parent.[individuals,appearances,issue.[stories,series.[publisher],arcs,individuals]],children.[individuals,appearances,issue.[series.[publisher]]]]]'
      );
  }

  getLastEdited(filter: any /*TODO*/, offset: number): Promise<Issue[]> {
    const query = Issue.query()
      .leftJoinRelated('[series.publisher]')
      .where('us', filter.us ? 1 : 0);

    if (filter.publishers) {
      query.where('name', filter.publishers[0].name);

      if (filter.series)
        query
          .where('series.title', filter.series[0].title)
          .where('volume', filter.series[0].volume);
    }

    return query
      .orderBy('updatedAt', 'desc')
      .offset(offset)
      .limit(25)
      .withGraphFetched('series.[publisher]');
  }

  async getNextIssue(issue: Issue) {
    let issues = await this.getIssuesOrderedByNumber(issue);

    let idx = issues.map((i: Issue) => i.number).indexOf(issue.number);
    if (issues.length < idx + 1) return null;

    return issues[idx + 1];
  }

  async getPreviousIssue(issue: Issue) {
    let issues = await this.getIssuesOrderedByNumber(issue);

    let idx = issues.map((i: Issue) => i.number).indexOf(issue.number);
    if (idx < 0) return null;

    return issues[idx - 1];
  }

  async createIssue(issue: Issue) {
    let trx = await Issue.startTransaction(knex);

    try {
      await asyncForEach(issue.stories, async (story: any) => {
        let issueCrawled = await new MarvelFandomCrawler()
          .crawl(
            story.parent.issue.number,
            story.parent.issue.series.title,
            story.parent.issue.series.volume
          )
          .catch(e => {
            throw e;
          });

        if (story.parent.number > issueCrawled.stories.length)
          throw Error('Story ' + story.issue.number + ' existiert nicht.');

        await this.handleIssue(issueCrawled, trx);

        issueCrawled = await Issue.query(trx)
          .leftJoinRelated('[series.publisher]')
          .where('number', issueCrawled.number)
          .where('variant', '')
          .where('us', 1)
          .where('series.title', issueCrawled.series.title)
          .where('volume', issueCrawled.series.volume)
          .withGraphFetched('stories')
          .first();

        let n = story.parent.number;
        story['parent'] = {};
        story['parent']['#dbRef'] = issueCrawled.stories[n - 1].id;
      });

      await this.handleIssue(issue, trx);

      await Issue.query(trx)
        .leftJoinRelated('[series.publisher]')
        .where('number', issue.number)
        .where('variant', '')
        .where('us', 1)
        .where('series.title', issue.series.title)
        .where('volume', issue.series.volume)
        .withGraphFetched('stories')
        .first();
    } catch (e) {
      trx.rollback();
      throw e;
    } finally {
      trx.commit();
    }
  }

  async handleIssue(issue: any, trx: Transaction) {
    if (issue.id !== undefined) {
      issue.id = undefined;
    }

    await asyncForEach(issue.stories, async (s: any) => {
      if (s.reprintOf) {
        let query = Story.query(trx)
          .leftJoinRelated('[issue.series.publisher]')
          .where('story.number', s.reprintOf.number)
          .where('issue.number', s.reprintOf.issue.number)
          .where('issue.variant', '')
          .where('issue:series:publisher.us', 1)
          .where('issue:series.title', s.reprintOf.issue.series.title)
          .where('issue:series.volume', s.reprintOf.issue.series.volume);

        await this.handleIssue(s.reprintOf.issue, trx);

        let originalStory = await query.first();

        s.reprintOf = {};
        s.reprintOf['#dbRef'] = originalStory.id;
      }
    });

    let variants: Issue[] = issue.variants ? issue.variants : [];

    issue.variants = undefined;
    issue = await this.markDuplicatesForIssue(issue, trx);

    if (issue['#dbRef']) return;

    issue.releasedate = issue.releasedate.replace('T', ' ').replace('Z', '');

    await Issue.query(trx).insertGraph(issue, {
      allowRefs: true,
      relate: true,
    });

    await asyncForEach(variants, async (v: Issue, n: number, a: any[]) => {
      console.log('\t\t\t[VARIANT] [%i/%i] %s', n + 1, a.length, v.variant);

      v.variants = undefined;
      v = await this.markIssue(v, trx);

      v.releasedate = v.releasedate.replace('T', ' ').replace('Z', '');

      await Issue.query(trx).insertGraph(v, {
        allowRefs: true,
        relate: true,
      });
    });
  }

  async markIssue(issue: any, trx: Transaction) {
    issue.series.id = undefined;
    if (issue.series.publisher) {
      issue.series.publisher.id = undefined;
      if (issue.series.publisher.original != undefined) {
        issue.series.publisher.us = issue.series.publisher.original;
        issue.series.publisher.original = undefined;
      }
    }

    let publisher: Publisher = await Publisher.query(trx)
      .where('name', issue.series.publisher.name)
      .where('us', issue.series.publisher.us)
      .first();

    if (publisher) {
      issue.series.publisher = {};
      issue.series.publisher['#dbRef'] = publisher.id;

      let s: Series = await Series.query(trx)
        .where('title', issue.series.title)
        .where('volume', issue.series.volume)
        .where('fk_publisher', publisher.id)
        .first();

      if (s) {
        issue.series = {};
        issue.series['#dbRef'] = s.id;

        let i: Issue = await Issue.query(trx)
          .where('number', issue.number)
          .where('fk_series', s.id)
          .where('variant', issue.variant ? issue.variant : '')
          .first();

        if (i) {
          issue = {};
          issue['#dbRef'] = i.id;
        }
      }
    }

    return issue;
  }

  async markDuplicatesForIssue(issue: any, trx: Transaction) {
    let individuals: Map<string, string> = new Map();
    let apps: Map<string, string> = new Map();
    let arcs: Map<string, string> = new Map();

    issue = await this.markIssue(JSON.parse(JSON.stringify(issue)), trx);

    if (issue['#dbRef']) {
      return issue;
    }

    await this.markDuplicates(
      individuals,
      issue.individuals,
      (o: Individual) => o.name,
      this.dbFnIndividuals,
      trx
    );

    await this.markDuplicates(
      arcs,
      issue.arcs,
      (o: Arc) => o.title + ' ' + o.type,
      this.dbFnArcs,
      trx
    );

    if (issue.cover) {
      await this.markDuplicates(
        individuals,
        issue.cover.individuals,
        (o: Individual) => o.name,
        this.dbFnIndividuals,
        trx
      );
    }

    await asyncForEach(issue.stories, async (story: any) => {
      await this.markDuplicates(
        individuals,
        story.individuals,
        (o: Individual) => o.name,
        this.dbFnIndividuals,
        trx
      );

      await this.markDuplicates(
        apps,
        story.appearances,
        (o: Appearance) => o.name + ' ' + o.type,
        this.dbFnAppearance,
        trx
      );
    });

    return issue;
  }

  dbFnIndividuals = async (o: Individual, trx: Transaction) => {
    let individual: Individual = await Individual.query(trx)
      .where('name', o.name)
      .first();
    return individual ? individual.id : individual;
  };

  dbFnAppearance = async (o: Appearance, trx: Transaction) => {
    let app: Appearance = await Appearance.query(trx)
      .where('name', o.name)
      .where('type', o.type)
      .first();
    return app ? app.id : app;
  };

  dbFnArcs = async (o: Arc, trx: Transaction) => {
    let arc: Arc = await Arc.query(trx)
      .where('title', o.title)
      .where('type', o.type)
      .first();
    return arc ? arc.id : arc;
  };

  async markDuplicates(
    ids: Map<string, string>,
    array: any[],
    keyFn: any,
    dbFn: any,
    trx: Transaction
  ) {
    await asyncForEach(array, async (o: any, i: number) => {
      let idFromDb: number = await dbFn(o, trx);
      if (idFromDb) {
        let type = array[i].type;
        let role = array[i].role;
        array[i] = {};
        array[i]['type'] = type;
        array[i]['role'] = role;
        array[i]['#dbRef'] = idFromDb;
      } else {
        let key = keyFn(o);

        if (!ids.has(key)) {
          let id = key.replaceAll(' ', '').toLowerCase();
          ids.set(key, id);
          o['#id'] = id;
        } else {
          let id = ids.get(key);
          let type = array[i].type;
          let role = array[i].role;
          array[i] = {};
          array[i]['type'] = type;
          array[i]['role'] = role;
          array[i]['#ref'] = id;
        }
      }
    });
  }

  async getIssuesOrderedByNumber(issue: Issue) {
    return Issue.query()
      .select(
        'issue.*',
        raw('cast(number as unsigned) as numberasint'),
        raw('fromRoman(number) as numberfromroman'),
        'number',
        'releasedate'
      )
      .min('issue.title as title')
      .where('fk_series', issue.series.id)
      .groupBy('number')
      .orderBy(['numberasint', 'numberfromroman', 'releasedate', 'number']);
  }

  async getVariants(parent: Issue) {
    return Issue.query()
      .leftJoinRelated('[series]')
      .where('issue.number', parent.number)
      .where('series.id', parent.series.id)
      .withGraphFetched(
        '[cover.[parent.[individuals],children.[individuals]], series.[publisher]]'
      );
  }
}
