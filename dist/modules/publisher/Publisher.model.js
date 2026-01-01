"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Publisher = void 0;
const sequelize_1 = require("sequelize");
class Publisher extends sequelize_1.Model {
    static associate(models) {
        Publisher.hasMany(models.Series, {
            as: 'Series',
            foreignKey: 'fk_publisher',
            onDelete: 'cascade',
        });
    }
}
exports.Publisher = Publisher;
exports.default = (sequelize) => {
    Publisher.init({
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
        original: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        addinfo: {
            type: sequelize_1.DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
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
    }, {
        indexes: [
            {
                unique: true,
                fields: ['name'],
            },
            {
                fields: ['id'],
            },
            {
                fields: ['name'],
            },
        ],
        sequelize,
        tableName: 'Publisher',
    });
    return Publisher;
};
