import {Model} from 'objection';
import {Base} from './Base';
import {OldSeries} from './OldSeries';

const unique = require('objection-unique')({
  fields: [['name', 'original']],
  identifiers: ['id'],
});

export class OldPublisher extends unique(Base) {
  static tableName = 'publisher';

  id!: number;
  name!: string;
  original!: number;
  addinfo!: string;
  startyear?: number;
  endyear?: number;
  series!: OldSeries[];

  static jsonSchema = {
    type: 'object',
    required: ['name', 'original', 'addinfo'],

    properties: {
      id: {type: 'integer'},
      name: {type: 'string', minLength: 1, maxLength: 255},
      original: {type: 'integer'},
      addinfo: {type: 'string', minLength: 0, maxLength: 1000},
      startyear: {type: 'integer'},
      endyear: {type: 'integer'},
    },
  };

  static relationMappings = {
    series: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldSeries',
      join: {
        from: 'publisher.id',
        to: 'series.fk_publisher',
      },
    },
  };
}
