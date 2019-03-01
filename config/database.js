import Sequelize from 'sequelize';

const sequelize = new Sequelize('shortbox_old', 'root', '', {
    host: 'localhost',
    dialect: 'mysql',
    charset: 'utf8',
    collate: 'utf8_general_ci',
    timestamps: true,
    operatorsAliases: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
});

export default sequelize;