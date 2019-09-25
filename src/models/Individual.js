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
    name: String,
    type: String
  }
  
  type Individual {
    id: ID,
    name: String,
    type: String
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
        name: (parent) => parent.name,
        type: async (parent) => {
            let where = {};
            let table = "";

            if(parent.Stories) {
                where.fk_story = parent.Stories[0].id;
                table = "Story_Individual";
            } else if(parent.Covers) {
                where.fk_cover = parent.Covers[0].id;
                table = "Cover_Individual";
            } else if(parent.Issues) {
                where.fk_issue = parent.Issues[0].id;
                table = "Issue_Individual";
            } else if(parent.Features) {
                where.fk_feature = parent.Features[0].id;
                table = "Feature_Individual";
            }

            where.fk_individual = parent.id;

            let relation = await models[table].findAll({
                where: where
            });

            return relation[0].type;
        }
    }
};
