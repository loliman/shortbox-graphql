import {Base} from './Base';

const unique = require('objection-unique')({
  fields: ['name'],
  identifiers: ['id'],
});

export class OldUser extends unique(Base) {
  static tableName = 'user';

  id!: number;
  name!: string;
  password!: string;
  sessionid!: string;

  private static jsonSchema = {
    type: 'object',
    required: ['id', 'name', 'password'],

    properties: {
      id: {type: 'integer'},
      name: {type: 'string', minLength: 1, maxLength: 255},
      password: {type: 'string', minLength: 1, maxLength: 255},
      sessionid: {type: 'string', minLength: 1, maxLength: 255},
    },
  };
}
