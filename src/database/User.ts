import {Base} from './Base';
import {ModelObject} from 'objection';

export class User extends Base {
  static tableName = 'user';

  id!: number;
  name!: string;
  password!: string;
  sessionid!: string;

  static jsonSchema = {
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

type UserDto = ModelObject<User>;
