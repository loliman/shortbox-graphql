"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Story = void 0;
const sequelize_1 = require("sequelize");
class Story extends sequelize_1.Model {
    static associate(models) {
        Story.hasMany(models.Story, { as: 'Children', foreignKey: 'fk_parent' });
        Story.hasMany(models.Story, { as: 'Reprints', foreignKey: 'fk_reprint' });
        Story.belongsTo(models.Issue, { foreignKey: 'fk_issue' });
        Story.belongsToMany(models.Individual, {
            through: models.Story_Individual,
            foreignKey: 'fk_story',
        });
        Story.belongsToMany(models.Appearance, {
            through: models.Story_Appearance,
            foreignKey: 'fk_story',
        });
    }
}
exports.Story = Story;
exports.default = (sequelize) => {
    Story.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        title: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        number: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
        },
        onlyapp: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        firstapp: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        otheronlytb: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        onlytb: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        onlyoneprint: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        collected: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        collectedmultipletimes: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        addinfo: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false,
            defaultValue: '',
        },
        part: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
    }, {
        sequelize,
        tableName: 'Story',
    });
    return Story;
};
