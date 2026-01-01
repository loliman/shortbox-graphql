"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cover = void 0;
const sequelize_1 = require("sequelize");
class Cover extends sequelize_1.Model {
    static associate(models) {
        Cover.hasMany(models.Cover, { as: 'Children', foreignKey: 'fk_parent' });
        Cover.belongsTo(models.Issue, { foreignKey: 'fk_issue' });
        Cover.belongsToMany(models.Individual, {
            through: models.Cover_Individual,
            foreignKey: 'fk_cover',
        });
    }
}
exports.Cover = Cover;
exports.default = (sequelize) => {
    Cover.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
        },
        url: {
            type: sequelize_1.DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        number: {
            type: sequelize_1.DataTypes.INTEGER,
            allowNull: false,
        },
        addinfo: {
            type: sequelize_1.DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
    }, {
        sequelize,
        tableName: 'Cover',
        indexes: [
            {
                unique: true,
                fields: ['fk_parent', 'fk_issue', 'number'],
            },
        ],
    });
    return Cover;
};
