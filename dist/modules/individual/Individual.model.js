"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Individual = void 0;
const sequelize_1 = require("sequelize");
class Individual extends sequelize_1.Model {
    static associate(models) {
        Individual.belongsToMany(models.Cover, {
            through: models.Cover_Individual,
            foreignKey: 'fk_individual',
        });
        Individual.belongsToMany(models.Feature, {
            through: models.Feature_Individual,
            foreignKey: 'fk_individual',
        });
        Individual.belongsToMany(models.Story, {
            through: models.Story_Individual,
            foreignKey: 'fk_individual',
        });
        Individual.belongsToMany(models.Issue, {
            through: models.Issue_Individual,
            foreignKey: 'fk_individual',
        });
    }
}
exports.Individual = Individual;
exports.default = (sequelize) => {
    Individual.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        name: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Individual',
        indexes: [
            {
                unique: true,
                fields: ['name'],
            },
        ],
    });
    return Individual;
};
