import Sequelize from 'sequelize';
import {db, dbPassword, dbUser} from "../config/config";

const sequelize = new Sequelize(db, dbUser, dbPassword, {
    logging: false,
    host: 'localhost',
    dialect: 'mysql',
    define: {
        charset: 'utf8',
        dialectOptions: {
            collate: 'utf8_general_ci'
        },
        timestamps: true
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