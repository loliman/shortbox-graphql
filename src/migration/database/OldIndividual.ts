import {Model} from 'objection';
import {Base} from './Base';
import {OldFeature} from './OldFeature';
import {OldStory} from './OldStory';
import {OldCover} from './OldCover';
import {OldIssue} from './OldIssue';

const unique = require('objection-unique')({
  fields: [['name']],
  identifiers: ['id'],
});

export class OldIndividual extends unique(Base) {
  static tableName = 'individual';

  id!: number;
  name!: string;

  features?: [OldFeature];
  stories?: [OldStory];
  covers?: [OldCover];
  issues?: [OldIssue];

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
      modelClass: 'OldFeature',
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
      modelClass: 'OldStory',
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
      modelClass: 'OldCover',
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
      modelClass: 'OldIssue',
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
