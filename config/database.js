import Sequelize from 'sequelize';

const sequelize = new Sequelize('shortbox_old', 'admin', 'admin', {
    host: 'localhost',
    dialect: 'mysql',
    operatorsAliases: false,
    define: {
        timestamps: false
    },
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
});

export default sequelize;