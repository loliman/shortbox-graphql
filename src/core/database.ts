import { Sequelize } from 'sequelize';
import { db, dbPassword, dbUser } from '../config/config';

const sequelize = new Sequelize(db, dbUser, dbPassword, {
  logging: false,
  host: 'localhost',
  dialect: 'mysql',
  port: 3336,
  define: {
    charset: 'utf8',
    collate: 'utf8_general_ci',
    timestamps: true,
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export default sequelize;
