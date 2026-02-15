import {Config} from './config/config';

let Model: any;

try {
  Model = require('./').Model;
} catch (err) {
  Model = require('objection').Model;
}

const Knex = require('knex');

async function main() {
  await createSchema();

  ///////////////////////////////////////////////////////////////
  // Your reproduction
  ///////////////////////////////////////////////////////////////

  await Person.query().insertGraph({
    firstName: 'Jennifer',
    lastName: 'Lawrence',

    pets: [
      {
        name: 'Doggo',
        species: 'dog',
      },
    ],

    movie: {
      name: 'A nice movie',
    },
  });

  const result = await Movie.query()
    .select('actors:pets.*', 'actors:pets:owner.*')
    .leftJoinRelated('[actors.pets.owner]')
    .where('movie.id', '=', 1)
    .whereNotNull('actors.id')
    .withGraphFetched('actors.[pets.[owner]]');

  console.log(result);
}

///////////////////////////////////////////////////////////////
// Database
///////////////////////////////////////////////////////////////

const knex = Knex({
  client: 'mysql2',
  connection: {
    host: '127.0.0.1',
    user: Config.DB_USER,
    password: Config.DB_PASSWORD,
    database: Config.DB_NAME,
  },
});

Model.knex(knex);

///////////////////////////////////////////////////////////////
// Models
///////////////////////////////////////////////////////////////

class Person extends Model {
  static get tableName() {
    return 'Person';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['firstName', 'lastName'],

      properties: {
        id: {type: 'integer'},
        movieId: {type: ['integer', 'null']},
        firstName: {type: 'string', minLength: 1, maxLength: 255},
        lastName: {type: 'string', minLength: 1, maxLength: 255},
        age: {type: 'number'},

        address: {
          type: 'object',
          properties: {
            street: {type: 'string'},
            city: {type: 'string'},
            zipCode: {type: 'string'},
          },
        },
      },
    };
  }

  static get relationMappings() {
    return {
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Animal,
        join: {
          from: 'Person.id',
          to: 'Animal.ownerId',
        },
      },

      movie: {
        relation: Model.BelongsToOneRelation,
        modelClass: Movie,
        join: {
          from: 'Person.movieId',
          to: 'Movie.id',
        },
      },
    };
  }
}

class Animal extends Model {
  static get tableName() {
    return 'Animal';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],

      properties: {
        id: {type: 'integer'},
        ownerId: {type: ['integer', 'null']},
        name: {type: 'string', minLength: 1, maxLength: 255},
        species: {type: 'string', minLength: 1, maxLength: 255},
      },
    };
  }

  static get relationMappings() {
    return {
      owner: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: {
          from: 'Animal.ownerId',
          to: 'Person.id',
        },
      },
    };
  }
}

class Movie extends Model {
  static get tableName() {
    return 'Movie';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],

      properties: {
        id: {type: 'integer'},
        name: {type: 'string', minLength: 1, maxLength: 255},
      },
    };
  }

  static get relationMappings() {
    return {
      actors: {
        relation: Model.HasManyRelation,
        modelClass: Person,
        join: {
          from: 'Movie.id',
          to: 'Person.movieId',
        },
      },
    };
  }
}

///////////////////////////////////////////////////////////////
// Schema
///////////////////////////////////////////////////////////////

async function createSchema() {
  await knex.schema
    .dropTableIfExists('Animal')
    .dropTableIfExists('Movie')
    .dropTableIfExists('Person');

  await knex.schema
    .createTable('Person', (table: any) => {
      table.increments('id').primary();
      table
        .integer('movieId')
        .unsigned()
        .references('id')
        .inTable('Person');
      table.string('firstName');
      table.string('lastName');
      table.integer('age');
      table.string('address');
    })
    .createTable('Movie', (table: any) => {
      table.increments('id').primary();
      table.string('name');
    })
    .createTable('Animal', (table: any) => {
      table.increments('id').primary();
      table
        .integer('ownerId')
        .unsigned()
        .references('id')
        .inTable('Person');
      table.string('name');
      table.string('species');
    });
}

main()
  .then(() => {
    console.log('success');
    return knex.destroy();
  })
  .catch(err => {
    console.error(err);
    return knex.destroy();
  });
