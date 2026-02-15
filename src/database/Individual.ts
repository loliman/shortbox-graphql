import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Feature} from './Feature';
import {Story} from './Story';
import {Cover} from './Cover';
import {Issue} from './Issue';

export class Individual extends Base {
  static tableName = 'individual';

  id!: number;
  name!: string;
  type!: string;
  features?: Feature[];
  stories?: Story[];
  covers?: Cover[];
  issues?: Issue[];

  static jsonSchema = {
    type: 'object',
    required: ['name'],

    properties: {
      id: {type: 'integer'},
      name: {type: 'string', minLength: 1, maxLength: 255},
    },
  };

  static relationMappings = {
    features: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Feature',
      join: {
        from: 'individual.id',
        through: {
          from: 'feature_individual.fk_individual',
          to: 'feature_individual.fk_feature',
          extra: ['type'],
        },
        to: 'feature.id',
      },
    },
    stories: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Story',
      join: {
        from: 'individual.id',
        through: {
          from: 'story_individual.fk_individual',
          to: 'story_individual.fk_story',
          extra: ['type'],
        },
        to: 'story.id',
      },
    },
    covers: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Cover',
      join: {
        from: 'individual.id',
        through: {
          from: 'cover_individual.fk_individual',
          to: 'cover_individual.fk_cover',
          extra: ['type'],
        },
        to: 'cover.id',
      },
    },
    issues: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Issue',
      join: {
        from: 'individual.id',
        through: {
          from: 'issue_individual.fk_individual',
          to: 'issue_individual.fk_issue',
          extra: ['type'],
        },
        to: 'issue.id',
      },
    },
  };
}

type IndividualDto = ModelObject<Individual>;
