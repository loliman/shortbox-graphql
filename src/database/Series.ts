import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Issue} from './Issue';
import {Publisher} from './Publisher';

export class Series extends Base {
  static tableName = 'series';

  id!: number;
  title!: string;
  volume!: number;
  addinfo!: string;
  startyear?: number;
  endyear?: number;
  genre?: string;
  publisher!: Publisher;
  issues!: Issue[];

  async issueCount(): Promise<number> {
    const query = this.seriesToIssueRelation();
    const issues: Issue[] = await query;
    return issues.length;
  }

  private seriesToIssueRelation(): any {
    return Issue.query()
      .leftJoinRelated('[series.[publisher]]')
      .where('series.id', '=', this.id)
      .whereNotNull('issue.id')
      .withGraphFetched('series.[publisher]');
  }

  async firstIssue(): Promise<Issue> {
    return this.seriesToIssueRelation()
      .orderBy(['releasedate', 'number', 'format'])
      .first();
  }

  async lastIssue(): Promise<Issue> {
    return await this.seriesToIssueRelation()
      .orderBy([
        {column: 'releasedate', order: 'desc'},
        {column: 'number', order: 'desc'},
        {column: 'format', order: 'desc'},
      ])
      .first();
  }

  async lastEditedIssue(): Promise<Issue[]> {
    return this.seriesToIssueRelation()
      .orderBy([{column: 'issues.updatedAt', order: 'desc'}])
      .limit(25);
  }

  static jsonSchema = {
    type: 'object',
    required: ['title', 'volume'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 255},
      volume: {type: 'integer'},
      addinfo: {type: 'string', minLength: 0, maxLength: 1000},
      startyear: {type: 'integer'},
      endyear: {type: 'integer'},
      genre: {type: 'string', minLength: 0, maxLength: 255},
    },
  };

  static relationMappings = {
    publisher: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Publisher',
      join: {
        from: 'series.fk_publisher',
        to: 'publisher.id',
      },
    },
    issues: {
      relation: Model.HasManyRelation,
      modelClass: 'Issue',
      join: {
        from: 'issue.fk_series',
        to: 'series.id',
      },
    },
  };

  /*async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let issues = await models.OldIssue.findAll({
                    where: {
                        fk_series: this.id
                    },
                    transaction
                });

                await asyncForEach(issues, async (issue) => {
                    await issue.delete(transaction);
                });

                let del = await this.destroy({transaction});
                resolve(del);
            } catch (e) {
                reject(e);
            }
        });
    }

    async create(item, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let pub = await models.OldPublisher.findOne({
                    where: {
                        name: item.publisher.name.trim()
                    },
                    transaction
                });

                let res = await models.OldSeries.create({
                    title: item.title.trim(),
                    volume: item.volume,
                    startyear: item.startyear,
                    endyear: item.endyear,
                    addinfo: item.addinfo,
                    genre: item.genre,
                    fk_publisher: pub.id
                }, {transaction: transaction});

                resolve(res);
            } catch (e) {
                reject(e);
            }
        });
    }*/
}

type SeriesDto = ModelObject<Series>;
