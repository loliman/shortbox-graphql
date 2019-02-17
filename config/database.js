import Sequelize from 'sequelize';

const sequelize = new Sequelize('shortbox', 'root', 'admin', {
    host: 'localhost',
    dialect: 'mysql',
    operatorsAliases: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
});

export default sequelize;