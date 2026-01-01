"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Feature = void 0;
const sequelize_1 = require("sequelize");
class Feature extends sequelize_1.Model {
    static associate(models) {
        Feature.belongsTo(models.Issue, { foreignKey: 'fk_issue' });
        Feature.belongsToMany(models.Individual, {
            through: models.Feature_Individual,
            foreignKey: 'fk_feature',
        });
    }
}
exports.Feature = Feature;
exports.default = (sequelize) => {
    Feature.init({
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
        number: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
        },
        addinfo: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Feature',
        indexes: [
            {
                unique: true,
                fields: ['title', 'fk_issue', 'number'],
            },
        ],
    });
    return Feature;
};
