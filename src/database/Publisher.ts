import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Series} from './Series';
import {Issue} from './Issue';

export class Publisher extends Base {
  static tableName = 'publisher';

  id!: number;
  name!: string;
  us!: number;
  addinfo!: string;
  startyear?: number;
  endyear?: number;
  series!: Series[];

  async seriesCount(): Promise<number> {
    const query = this.publisherToSeriesRelation();
    const series: Series[] = await query;
    return series.length;
  }

  async issueCount(): Promise<number> {
    const query = this.publisherToIssueRelation();
    const issues: Issue[] = await query;
    return issues.length;
  }

  async firstIssue(): Promise<Issue> {
    return this.publisherToIssueRelation()
      .orderBy(['releasedate', 'number', 'format'])
      .first();
  }

  async lastIssue(): Promise<Issue> {
    return this.publisherToIssueRelation()
      .orderBy([
        {column: 'releasedate', order: 'desc'},
        {column: 'number', order: 'desc'},
        {column: 'format', order: 'desc'},
      ])
      .first();
  }

  async lastEditedIssue(): Promise<Issue[]> {
    return this.publisherToIssueRelation()
      .orderBy([{column: 'series:issues.updatedAt', order: 'desc'}])
      .limit(25);
  }

  private publisherToIssueRelation(): any {
    return Issue.query()
      .leftJoinRelated('[series.publisher]')
      .where('series:publisher.id', '=', this.id)
      .whereNotNull('issue.id')
      .withGraphFetched('series.[publisher]');
  }

  private publisherToSeriesRelation(): any {
    return Series.query()
      .leftJoinRelated('[publisher]')
      .where('publisher.id', '=', this.id)
      .whereNotNull('series.id')
      .withGraphFetched('publisher');
  }

  static jsonSchema = {
    type: 'object',
    required: ['name', 'us'],

    properties: {
      id: {type: 'integer'},
      name: {type: 'string', minLength: 1, maxLength: 255},
      us: {type: 'integer'},
      addinfo: {type: 'string', minLength: 0, maxLength: 1000},
      startyear: {type: 'integer'},
      endyear: {type: 'integer'},
    },
  };

  static relationMappings = {
    series: {
      relation: Model.HasManyRelation,
      modelClass: 'Series',
      join: {
        from: 'publisher.id',
        to: 'series.fk_publisher',
      },
    },
  };

  /*async create(item, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let res = await models.OldPublisher.create({
                    name: item.name.trim(),
                    addinfo: item.addinfo,
                    original: item.original,
                    startyear: item.startyear,
                    endyear: item.endyear
                }, {transaction: transaction});

                resolve(res);
            } catch (e) {
                reject(e);
            }
        });
    }

    async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let series = await models.OldSeries.findAll({
                    where: {
                        fk_publisher: this.id
                    },
                    transaction
                });

                await asyncForEach(series, async (series) => {
                    await series.delete(transaction);
                });

                let del = await this.destroy({transaction});
                resolve(del);
            } catch (e) {
                reject(e);
            }
        });
    }*/
}

type PublisherDto = ModelObject<Publisher>;
