import Sequelize from 'sequelize';
import {dbPassword, dbUser} from "../../config/config";

const sequelize = new Sequelize('comics.org', dbUser, dbPassword, {
    logging: false,
    host: '127.0.0.1',
    dialect: 'mysql',
    define: {
        charset: 'utf8',
        dialectOptions: {
            collate: 'utf8_general_ci'
        },
        timestamps: false
    },
    operatorsAliases: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
});

export default sequelize;
