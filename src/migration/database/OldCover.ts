import {Model} from 'objection';
import {Base} from './Base';
import {OldIndividual} from './OldIndividual';
import {OldIssue} from './OldIssue';

const unique = require('objection-unique')({
  fields: ['fk_parent', 'fk_issue', 'number'],
  identifiers: ['id'],
});

export class OldCover extends unique(Base) {
  static tableName = 'cover';

  id!: number;
  url!: string;
  number!: number;
  addinfo!: string;

  parent!: OldCover;
  children!: OldCover[];
  issue!: OldIssue;
  individuals!: OldIndividual[];

  static jsonSchema = {
    type: 'object',
    required: ['id', 'url', 'number', 'addinfo'],

    properties: {
      id: {type: 'integer'},
      url: {type: 'string', minLength: 1, maxLength: 1000},
      number: {type: 'integer'},
      addinfo: {type: 'string', minLength: 1, maxLength: 1000},
    },
  };

  static relationMappings = {
    children: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Cover',
      join: {
        from: 'cover.id',
        to: 'cover.fk_parent',
      },
    },
    parent: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Cover',
      join: {
        from: 'cover.fk_parent',
        to: 'cover.id',
      },
    },
    issue: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Issue',
      join: {
        from: 'cover.fk_issue',
        to: 'issue.id',
      },
    },
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldIndividual',
      join: {
        from: 'cover.id',
        through: {
          from: 'cover_individual.fk_cover',
          to: 'cover_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
  };
}
