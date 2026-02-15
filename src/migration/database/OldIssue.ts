import {Model} from 'objection';
import {Base} from './Base';
import {OldIndividual} from './OldIndividual';
import {OldCover} from './OldCover';
import {OldArc} from './OldArc';
import {OldFeature} from './OldFeature';
import {OldSeries} from './OldSeries';
import {OldStory} from './OldStory';

const unique = require('objection-unique')({
  fields: ['number', 'fk_series', 'variant', 'format'],
  identifiers: ['id'],
});

export class OldIssue extends unique(Base) {
  static tableName = 'issue';

  id!: number;
  title!: string;
  number!: string;
  format!: string;
  limitation?: number;
  variant?: string;
  releasedate: Date = new Date(0);
  pages: number = 0;
  price: number = 0;
  currency: string = 'EUR';
  addinfo: string = '';
  verified: boolean = false;

  stories!: OldStory[];
  series!: OldSeries;

  static jsonSchema = {
    type: 'object',
    required: ['number', 'format', 'releasedate'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 0, maxLength: 255},
      number: {type: 'string', minLength: 1, maxLength: 255},
      format: {type: 'string', minLength: 1, maxLength: 255},
      limitation: {type: 'integer'},
      variant: {type: 'string', minLength: 0, maxLength: 255},
      releasedate: {type: 'string'},
      pages: {type: 'integer'},
      price: {type: 'integer'},
      currency: {type: 'string', minLength: 0, maxLength: 3},
      addinfo: {type: 'string', minLength: 0, maxLength: 1000},
      verified: {type: 'integer'},
    },
  };

  static relationMappings = {
    series: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'OldSeries',
      join: {
        from: 'issue.fk_series',
        to: 'series.id',
      },
    },
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'OldIndividual',
      join: {
        from: 'issue.id',
        through: {
          from: 'issue_individual.fk_issue',
          to: 'issue_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
    covers: {
      relation: Model.HasManyRelation,
      modelClass: 'OldCover',
      join: {
        from: 'issue.id',
        to: 'cover.fk_issue',
      },
    },
    arcs: {
      relation: Model.HasManyRelation,
      modelClass: 'OldArc',
      join: {
        from: 'issue.id',
        through: {
          from: 'issue_arc.fk_issue',
          to: 'issue_arc.fk_arc',
        },
        to: 'arc.id',
      },
    },
    stories: {
      relation: Model.HasManyRelation,
      modelClass: 'OldStory',
      join: {
        from: 'issue.id',
        to: 'story.fk_issue',
      },
    },
    features: {
      relation: Model.HasManyRelation,
      modelClass: 'OldFeature',
      join: {
        from: 'issue.id',
        to: 'feature.fk_issue',
      },
    },
  };
}
