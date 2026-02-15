import {Model} from 'objection';
import {Base} from './Base';
import {OldIndividual} from './OldIndividual';
import {OldIssue} from './OldIssue';
import {OldAppearance} from './OldAppearance';

const unique = require('objection-unique')({
  fields: ['fk_parent', 'fk_issue', 'number'],
  identifiers: ['id'],
});

export class OldStory extends unique(Base) {
  static tableName = 'story';

  id!: number | undefined;
  title!: string;
  number!: number;
  addinfo!: string;
  pages!: string;

  children!: OldStory[];
  individuals!: OldIndividual[];
  appearances!: OldAppearance[];

  parent!: OldStory;
  issue!: OldIssue;

  static jsonSchema = {
    type: 'object',
    required: ['number'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 1000},
      number: {type: 'integer'},
      addinfo: {type: 'string', minLength: 1, maxLength: 1000},
    },
  };

  static relationMappings = {
    children: {
      relation: Model.HasManyRelation,
      modelClass: 'OldStory',
      join: {
        from: 'story.id',
        to: 'story.fk_parent',
      },
    },
    parent: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'OldStory',
      join: {
        from: 'story.fk_parent',
        to: 'story.id',
      },
    },
    issue: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'OldIssue',
      join: {
        from: 'story.fk_issue',
        to: 'issue.id',
      },
    },
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldIndividual',
      join: {
        from: 'story.id',
        through: {
          from: 'story_individual.fk_story',
          to: 'story_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
    appearances: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldAppearance',
      join: {
        from: 'story.id',
        through: {
          from: 'story_appearance.fk_story',
          to: 'story_appearance.fk_appearance',
          extra: ['role', 'firstapp'],
        },
        to: 'appearance.id',
      },
    },
  };
}
