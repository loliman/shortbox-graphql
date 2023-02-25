import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach} from "../util/util";

class Feature extends Model {
    static tableName = 'Feature';

    static associate(models) {
        Feature.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Feature.belongsToMany(models.Individual, {through: models.Feature_Individual, foreignKey: 'fk_feature'});
    }

    async associateIndividual(name, type, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Individual.findOrCreate({
                    where: {
                        name: name
                    },
                    transaction: transaction
                }).then(async ([individual, created]) => {
                    resolve(await models.Feature_Individual.create({
                        fk_feature: this.id,
                        fk_individual: individual.id,
                        type: type
                    }, {transaction: transaction}));
                }).catch(e => reject(e));
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
        individuals: [IndividualInput],
        title: String,
        addinfo: String
    }
      
    type Feature {
      id: ID,
      title: String,
      number: Int,
      addinfo: String,
      issue: Issue,
      individuals: [Individual]
    }
`;

export const resolvers = {
    Feature: {
        id: (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return new Date();

            return parent.id;
        },
        title: (parent) => parent.title.trim(),
        number: (parent) => parent.number,
        addinfo: (parent) => parent.addinfo,
        issue: async (parent) => await models.Issue.findById(parent.fk_issue),
        individuals: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Feature
            }],
            where: {
                '$Features->Feature_Individual.fk_feature$': parent.id
            }
        })
    }
};

export async function create(feature, issue, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            let resFeature = await models.Feature.create({
                number: feature.number,
                title: feature.title.trim(),
                addinfo: feature.addinfo,
                fk_issue: issue.id
            }, {transaction: transaction});

            if (feature.individuals)
                await asyncForEach(feature.individuals, async individual => {
                    if (individual.name && individual.name.trim() !== '')
                        await asyncForEach(individual.type, async type => {
                            await resFeature.associateIndividual(individual.name.trim(), type, transaction);
                        });
                });

            await resFeature.save({transaction: transaction});

            resolve(feature);
        } catch (e) {
            reject(e);
        }
    });
}

export async function getFeatures(issue, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            let oldFeatures = [];
            let rawFeatures = await models.Feature.findAll({where: {fk_issue: issue.id}, transaction});
            await asyncForEach(rawFeatures, async feature => {
                let rawFeature = {};
                rawFeature.title = feature.title;
                rawFeature.number = !isNaN(feature.number) ? feature.number : 1;
                rawFeature.addinfo = feature.addinfo;

                let individuals = await models.Individual.findAll({
                    include: [{
                        model: models.Feature
                    }],
                    where: {
                        '$Features->Feature_Individual.fk_feature$': feature.id
                    },
                    transaction,
                    raw: true
                });

                rawFeature.individuals = [];
                if (individuals) {
                    individuals.forEach(individual => {
                        let i = rawFeature.individuals.find(n => n.name === individual.name);

                        if (!i) {
                            i = {name: individual.name, type: []};
                            rawFeature.individuals.push(i);
                        }

                        i.type.push(individual["Stories.Feature_Individual.type"]);
                    });
                }

                oldFeatures.push(rawFeature);
            });

            resolve(oldFeatures);
        } catch (e) {
            reject(e);
        }
    });
}

export function equals(a, b) {
    if (a.individuals.length !== b.individuals.length)
        return false;

    let found = a.individuals.every(aIndividual => {
        let r = b.individuals.find(bIndividual => aIndividual.name === bIndividual.name);

        if (r)
            return aIndividual.type.every(aType => r.type.some(bType => aType === bType));

        return false;
    });

    return (found && a.title === b.title && a.number === b.number && a.addinfo === b.addinfo);
}
