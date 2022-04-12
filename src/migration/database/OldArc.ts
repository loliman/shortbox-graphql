import {Model} from 'objection';
import {Base} from './Base';
import {OldIssue} from './OldIssue';

const unique = require('objection-unique')({
  fields: [['title', 'type']],
  identifiers: ['id'],
});

export class OldArc extends unique(Base) {
  static tableName = 'arc';

  id!: number;
  title!: string;
  type!: string;

  issues(): Promise<OldIssue> {
    return this.$relatedQuery('issues');
  }

  static jsonSchema = {
    type: 'object',
    required: ['title', 'type'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 255},
      type: {type: 'string', minLength: 1, maxLength: 255},
    },
  };

  static relationMappings = {
    issues: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldIssue',
      join: {
        from: 'arc.id',
        through: {
          from: 'issue_arc.fk_arc',
          to: 'issue_arc.fk_issue',
        },
        to: 'issue.id',
      },
    },
  };
}
