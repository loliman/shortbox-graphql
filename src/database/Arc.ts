import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Issue} from './Issue';

export class Arc extends Base {
  static tableName = 'arc';

  id!: number;
  title!: string;
  type!: string;
  issues!: Issue[];

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
      modelClass: 'Issue',
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

type ArcDto = ModelObject<Arc>;
