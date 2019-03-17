import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Feature extends Model {
    static tableName = 'Feature';

    static associate(models) {
        Feature.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Feature.belongsToMany(models.Individual, {through: models.Feature_Individual, foreignKey: 'fk_feature'});
    }

    async associateIndividual(name, type) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Individual.findOrCreate({
                    where: {
                        name: name
                    }
                }).then(async ([individual, created]) => {
                    resolve(await models.Feature_Individual.create({fk_feature: this.id, fk_individual: individual.id, type: type}));
                });
            } catch (e) {
                reject(e);
            }
        });
    }
}

export default (sequelize) => {
    Feature.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        addinfo: {
            type: Sequelize.STRING(255),
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['title', 'fk_issue', 'number']
        }],
        sequelize,
        tableName: Feature.tableName
    });

    return Feature;
};

export const typeDef = gql`
    input FeatureInput {
        id: String,
        number: Int!,
        writer: IndividualInput,
        title: String,
        addinfo: String
    }
      
    type Feature {
      id: ID,
      title: String,
      number: Int,
      addinfo: String,
      issue: Issue,
      writers: [Individual]
    }
`;

export const resolvers = {
    Feature: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        addinfo: (parent) => parent.addinfo,
        issue: async (parent) => await models.Issue.findById(parent.fk_issue),
        writers: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Feature
            }],
            where: {
                '$Features->Feature_Individual.fk_feature$': parent.id,
                '$Features->Feature_Individual.type$': 'WRITER'
            }
        })
    }
};

export async function create(feature, issue) {
    return new Promise(async (resolve, reject) => {
        try {
            let resFeature = await models.Feature.create({
                number: feature.number,
                title: feature.title,
                addinfo: feature.addinfo,
                fk_issue: issue.id
            });

            if (feature.writer.name.trim() !== '')
                await resFeature.associateIndividual(feature.writer.name.trim(), 'WRITER');

            await resFeature.save();

            resolve(feature);
        } catch (e) {
            reject(e);
        }
    });
}