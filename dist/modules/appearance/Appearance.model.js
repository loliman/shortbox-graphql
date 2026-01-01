"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Appearance = void 0;
const sequelize_1 = require("sequelize");
class Appearance extends sequelize_1.Model {
    static associate(models) {
        Appearance.belongsToMany(models.Story, {
            through: models.Story_Appearance,
            foreignKey: 'fk_appearance',
        });
    }
}
exports.Appearance = Appearance;
exports.default = (sequelize) => {
    Appearance.init({
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
        type: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Appearance',
        indexes: [
            {
                unique: true,
                fields: ['name', 'type'],
            },
        ],
    });
    return Appearance;
};
