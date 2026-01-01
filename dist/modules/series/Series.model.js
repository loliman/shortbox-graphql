"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Series = void 0;
const sequelize_1 = require("sequelize");
class Series extends sequelize_1.Model {
    static associate(models) {
        Series.hasMany(models.Issue, { as: 'Issue', foreignKey: 'fk_series', onDelete: 'cascade' });
        Series.belongsTo(models.Publisher, { foreignKey: 'fk_publisher' });
    }
    // Die delete Methode wird später in einen Service verschoben,
    // hier bleibt sie vorerst für die Kompatibilität mit dem bestehenden Code.
    async deleteInstance(transaction, models) {
        const issues = await models.Issue.findAll({
            where: { fk_series: this.id },
            transaction,
        });
        for (const issue of issues) {
            await issue.delete(transaction);
        }
        await this.destroy({ transaction });
    }
}
exports.Series = Series;
exports.default = (sequelize) => {
    Series.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        title: {
            type: sequelize_1.DataTypes.STRING(255),
        },
        startyear: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        endyear: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
        },
        volume: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
        },
        addinfo: {
            type: sequelize_1.DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
    }, {
        indexes: [
            {
                unique: true,
                fields: ['title', 'volume', 'fk_publisher'],
            },
            {
                fields: ['id'],
            },
            {
                fields: ['title', 'volume'],
            },
        ],
        sequelize,
        tableName: 'Series',
    });
    return Series;
};
