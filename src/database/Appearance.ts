import {Model, ModelObject} from 'objection';
import {Story} from './Story';
import {Base} from './Base';

export class Appearance extends Base {
  static tableName = 'appearance';

  id!: number;
  name!: string;
  type!: string;
  stories!: Story[];
  role!: string;
  firstapp!: boolean;

  static jsonSchema = {
    type: 'object',
    required: ['name', 'type'],

    properties: {
      id: {type: 'integer'},
      name: {type: 'string', minLength: 1, maxLength: 255},
      type: {type: 'string', minLength: 1, maxLength: 255},
    },
  };

  static relationMappings = {
    stories: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Story',
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

type AppearanceDto = ModelObject<Appearance>;
