import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Individual extends Model {
    static tableName = 'Individual';

    static associate(models) {
        Individual.belongsToMany(models.Cover, {through: models.Cover_Individual, foreignKey: 'fk_individual'});
        Individual.belongsToMany(models.Feature, {through: models.Feature_Individual, foreignKey: 'fk_individual'});
        Individual.belongsToMany(models.Story, {through: models.Story_Individual, foreignKey: 'fk_individual'});
        Individual.belongsToMany(models.Issue, {through: models.Issue_Individual, foreignKey: 'fk_individual'});
    }
}

export default (sequelize) => {
    Individual.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }],
        sequelize,
        tableName: Individual.tableName
    });

    return Individual;
};

export const typeDef = gql`
  extend type Query {
    individuals: [Individual]  
  }
  
  input IndividualInput {
    name: String
  }
  
  type Individual {
    id: ID,
    name: String
  }
`;

export const resolvers = {
    Query: {
        individuals: () => models.Individual.findAll({
            order: [['name', 'ASC']]
        })
    },
    Individual: {
        id: (parent) => parent.id,
        name: (parent) => parent.name
    }
};