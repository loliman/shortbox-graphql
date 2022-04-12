import {Model} from 'objection';
import {Base} from './Base';
import {Story} from '../../database/Story';

const unique = require('objection-unique')({
  fields: [['name', 'type']],
  identifiers: ['id'],
});

export class OldAppearance extends unique(Base) {
  static tableName = 'appearance';

  id!: number;
  name!: string;
  type!: string;
  stories!: Story[];
  role!: string;
  firstapp!: boolean;

  static jsonSchema = {
    type: 'object',
    required: ['id', 'name', 'type'],

    properties: {
      id: {type: 'integer'},
      name: {type: 'string', minLength: 1, maxLength: 255},
      type: {type: 'string', minLength: 1, maxLength: 255},
    },
  };

  static relationMappings = {
    stories: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldStory',
      join: {
        from: 'appearance.id',
        through: {
          from: 'story_appearance.fk_appearance',
          to: 'story_appearance.fk_story',
          extra: ['role', 'firstapp'],
        },
        to: 'story.id',
      },
    },
  };
}
