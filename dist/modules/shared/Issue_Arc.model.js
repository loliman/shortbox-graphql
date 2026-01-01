"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Issue_Arc = void 0;
const sequelize_1 = require("sequelize");
class Issue_Arc extends sequelize_1.Model {
}
exports.Issue_Arc = Issue_Arc;
exports.default = (sequelize) => {
    Issue_Arc.init({
        fk_issue: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
        fk_arc: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Issue_Arc',
    });
    return Issue_Arc;
};
