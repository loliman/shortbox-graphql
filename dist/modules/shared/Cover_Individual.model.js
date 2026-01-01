"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cover_Individual = void 0;
const sequelize_1 = require("sequelize");
class Cover_Individual extends sequelize_1.Model {
}
exports.Cover_Individual = Cover_Individual;
exports.default = (sequelize) => {
    Cover_Individual.init({
        fk_cover: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
        fk_individual: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
        type: {
            type: sequelize_1.DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Cover_Individual',
    });
    return Cover_Individual;
};
