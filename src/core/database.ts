import { Sequelize } from 'sequelize';
import { db, dbPassword, dbUser } from '../config/config';

const dbSchema = (process.env.DB_SCHEMA || 'public').toLowerCase();

const sequelize = new Sequelize(db, dbUser, dbPassword, {
  logging: false,
  host: process.env.DB_HOST || 'localhost',
  dialect: 'postgres',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  quoteIdentifiers: false,
  define: {
    timestamps: true,
    schema: dbSchema,
    createdAt: 'createdat',
    updatedAt: 'updatedat',
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export default sequelize;
