import {Model} from 'objection';
import {Base} from './Base';
import {OldIssue} from './OldIssue';
import {OldIndividual} from './OldIndividual';

const unique = require('objection-unique')({
  fields: ['title', 'fk_issue', 'number'],
  identifiers: ['id'],
});

export class OldFeature extends unique(Base) {
  static tableName = 'feature';

  id!: number;
  title!: string;
  number!: number;
  addinfo!: string;
  issue!: OldIssue;
  individuals!: OldIndividual[];

  static jsonSchema = {
    type: 'object',
    required: ['id', 'title', 'number', 'addinfo'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 255},
      number: {type: 'integer'},
      addinfo: {type: 'string', minLength: 1, maxLength: 1000},
    },
  };

  static relationMappings = {
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldIndividual',
      join: {
        from: 'feature.id',
        through: {
          from: 'feature_individual.fk_feature',
          to: 'feature_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
    issue: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'OldIssue',
      join: {
        from: 'feature.fk_issue',
        to: 'issue.id',
      },
    },
  };
}
