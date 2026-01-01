"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Story_Appearance = void 0;
const sequelize_1 = require("sequelize");
class Story_Appearance extends sequelize_1.Model {
}
exports.Story_Appearance = Story_Appearance;
exports.default = (sequelize) => {
    Story_Appearance.init({
        fk_appearance: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
        fk_story: {
            type: sequelize_1.DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
        role: {
            type: sequelize_1.DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
        },
    }, {
        sequelize,
        tableName: 'Story_Appearance',
    });
    return Story_Appearance;
};
