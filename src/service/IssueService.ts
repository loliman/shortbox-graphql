import {Series} from '../database/Series';
import {Issue} from '../database/Issue';
import {raw} from 'objection';

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
