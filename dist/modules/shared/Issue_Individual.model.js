"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Issue_Individual = void 0;
const sequelize_1 = require("sequelize");
class Issue_Individual extends sequelize_1.Model {
}
exports.Issue_Individual = Issue_Individual;
exports.default = (sequelize) => {
    Issue_Individual.init({
        fk_issue: {
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
        tableName: 'Issue_Individual',
    });
    return Issue_Individual;
};
