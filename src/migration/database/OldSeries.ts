import {Model} from 'objection';
import {Base} from './Base';
import {OldIssue} from './OldIssue';
import {OldPublisher} from './OldPublisher';

const unique = require('objection-unique')({
  fields: [['title', 'volume', 'fk_publisher']],
  identifiers: ['id'],
});

export class OldSeries extends unique(Base) {
  static tableName = 'series';

  id!: number;
  title!: string;
  volume!: number;
  addinfo!: string;
  startyear?: number;
  endyear?: number;
  issues!: OldIssue[];

  publisher!: OldPublisher;

  static jsonSchema = {
    type: 'object',
    required: ['title', 'volume', 'addinfo'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 255},
      volume: {type: 'integer'},
      addinfo: {type: 'string', minLength: 0, maxLength: 1000},
      startyear: {type: 'integer'},
      endyear: {type: 'integer'},
    },
  };

  static relationMappings = {
    publisher: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'OldPublisher',
      join: {
        from: 'series.fk_publisher',
        to: 'publisher.id',
      },
    },
    issues: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldIssue',
      join: {
        from: 'issue.fk_series',
        to: 'series.id',
      },
    },
  };
}
