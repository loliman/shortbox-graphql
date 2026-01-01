"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Arc = void 0;
const sequelize_1 = require("sequelize");
class Arc extends sequelize_1.Model {
    static associate(models) {
        Arc.belongsToMany(models.Issue, { through: models.Issue_Arc, foreignKey: 'fk_arc' });
    }
}
exports.Arc = Arc;
exports.default = (sequelize) => {
    Arc.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        title: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Arc',
        indexes: [
            {
                unique: true,
                fields: ['title', 'type'],
            },
        ],
    });
    return Arc;
};
