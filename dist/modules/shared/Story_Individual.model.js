"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Story_Individual = void 0;
const sequelize_1 = require("sequelize");
class Story_Individual extends sequelize_1.Model {
}
exports.Story_Individual = Story_Individual;
exports.default = (sequelize) => {
    Story_Individual.init({
        fk_story: {
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
        tableName: 'Story_Individual',
    });
    return Story_Individual;
};
