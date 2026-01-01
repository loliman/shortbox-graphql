"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Feature_Individual = void 0;
const sequelize_1 = require("sequelize");
class Feature_Individual extends sequelize_1.Model {
}
exports.Feature_Individual = Feature_Individual;
exports.default = (sequelize) => {
    Feature_Individual.init({
        fk_feature: {
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
        tableName: 'Feature_Individual',
    });
    return Feature_Individual;
};
