import Sequelize from 'sequelize';
import {migration_db, migration_dbPassword, migration_dbUser} from "../../config/config";

const migrationDatabase = new Sequelize(migration_db, migration_dbUser, migration_dbPassword, {
    logging: false,
    host: 'localhost',
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

export default migrationDatabase;