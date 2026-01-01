"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Issue = void 0;
const sequelize_1 = require("sequelize");
class Issue extends sequelize_1.Model {
    static associate(models) {
        Issue.hasMany(models.Story, {
            as: { singular: 'Issue', plural: 'Stories' },
            foreignKey: 'fk_issue',
            onDelete: 'cascade',
        });
        Issue.hasMany(models.Cover, { foreignKey: 'fk_issue', onDelete: 'cascade' });
        Issue.belongsTo(models.Series, { foreignKey: 'fk_series' });
        Issue.belongsToMany(models.Individual, {
            through: models.Issue_Individual,
            foreignKey: 'fk_issue',
        });
        Issue.belongsToMany(models.Arc, { through: models.Issue_Arc, foreignKey: 'fk_issue' });
    }
    async deleteInstance(transaction, models) {
        // Logik zur Dateilöschung und Kaskadierung
        // In der finalen Version sollte das in einen Service
        const cover = await models.Cover.findOne({
            where: { fk_issue: this.id, number: 0 },
            transaction,
        });
        // Hier müsste die File-Cleanup Logik rein (deleteFile)
        await models.Story.destroy({ where: { fk_issue: this.id }, transaction });
        await models.Feature.destroy({ where: { fk_issue: this.id }, transaction });
        await models.Cover.destroy({ where: { fk_issue: this.id }, transaction });
        await this.destroy({ transaction });
    }
}
exports.Issue = Issue;
exports.default = (sequelize) => {
    Issue.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
        },
        title: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        number: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        format: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        variant: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        releasedate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: false,
        },
        pages: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        price: {
            type: sequelize_1.DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
        },
        currency: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        verified: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        collected: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        comicguideid: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        isbn: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        limitation: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            defaultValue: '',
        },
        addinfo: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false,
            defaultValue: '',
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: ['number', 'variant', 'fk_series'],
            },
            {
                fields: ['id'],
            },
            {
                fields: ['number'],
            },
        ],
        sequelize,
        tableName: 'Issue',
    });
    return Issue;
};
