import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Appearance extends Model {
    static tableName = 'Appearance';

    static associate(models) {
        Appearance.belongsToMany(models.Story, {through: models.Story_Appearance, foreignKey: 'fk_appearance'});
    }
}

export default (sequelize) => {
    Appearance.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        type: {
            type: Sequelize.STRING(255),
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name', 'type']
        }],
        sequelize,
        tableName: Appearance.tableName
    });

    return Appearance;
};