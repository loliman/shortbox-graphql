require('dotenv').config();

const schema = (process.env.DB_SCHEMA || 'public').toLowerCase();

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    quoteIdentifiers: false,
    define: { schema, createdAt: 'createdat', updatedAt: 'updatedat' },
  },
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME + '_test',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    quoteIdentifiers: false,
    define: { schema, createdAt: 'createdat', updatedAt: 'updatedat' },
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    quoteIdentifiers: false,
    define: { schema, createdAt: 'createdat', updatedAt: 'updatedat' },
  },
};
