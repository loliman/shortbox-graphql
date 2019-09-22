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

export const typeDef = gql`
    extend type Query {
      apps: [Appearance]  
    }
    
    input AppearanceInput {
      id: String,
      name: String
    }
    
    type Appearance {
      id: ID,
      name: String,
      type: String,
      role: String
    }
`;

export const resolvers = {
    Query: {
        apps: () => models.Appearance.findAll({
            order: [['name', 'ASC']]
        })
    },
    Appearance: {
        id: (parent) => parent.id,
        name: (parent) => parent.name.trim(),
        type: (parent) => (parent.type.trim() === '' ? 'CHARACTER' : parent.type),
        role: (parent) => ''
    }
};