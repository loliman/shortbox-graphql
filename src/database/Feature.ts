import {Model, ModelObject} from 'objection';
import {Base} from './Base';
import {Issue} from './Issue';
import {Individual} from './Individual';

export class Feature extends Base {
  static tableName = 'feature';

  id!: number;
  title!: string;
  number!: number;
  addinfo!: string;

  issue!: Issue;
  individuals!: Individual[];

  static jsonSchema = {
    type: 'object',
    required: ['id', 'title', 'number', 'addinfo'],

    properties: {
      id: {type: 'integer'},
      title: {type: 'string', minLength: 1, maxLength: 255},
      number: {type: 'integer'},
      addinfo: {type: 'string', minLength: 1, maxLength: 1000},
    },
  };

  static relationMappings = {
    individuals: {
      relation: Model.ManyToManyRelation,
      modelClass: 'Individual',
      join: {
        from: 'feature.id',
        through: {
          from: 'feature_individual.fk_feature',
          to: 'feature_individual.fk_individual',
          extra: ['type'],
        },
        to: 'individual.id',
      },
    },
    issue: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Issue',
      join: {
        from: 'feature.fk_issue',
        to: 'issue.id',
      },
    },
  };

  /*async create(feature, issue, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let resFeature = await models.OldFeature.create({
                    number: feature.number,
                    title: feature.title.trim(),
                    addinfo: feature.addinfo,
                    fk_issue: issue.id
                }, {transaction: transaction});

                if(feature.individuals)
                    await asyncForEach(feature.individuals, async individual => {
                        if(individual.name && individual.name.trim() !== '')
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

    async associateIndividual(name: string, type: string, transaction: Transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                sequelize.models.OldIndividual.findOrCreate({
                    where: {
                        name: name
                    },
                    transaction: transaction
                }).then(async ([individual, created]) => {
                    resolve(await sequelize.models.Feature_Individual.create({fk_feature: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async getFeatures(issue, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let oldFeatures = [];
                let rawFeatures = await models.OldFeature.findAll({where: {fk_issue: issue.id}, transaction});
                await asyncForEach(rawFeatures, async feature => {
                    let rawFeature = {};
                    rawFeature.title = feature.title;
                    rawFeature.number = !isNaN(feature.number) ? feature.number : 1;
                    rawFeature.addinfo = feature.addinfo;

                    let individuals = await models.OldIndividual.findAll({
                        include: [{
                            model: models.OldFeature
                        }],
                        where: {
                            '$Features->Feature_Individual.fk_feature$': feature.id
                        },
                        transaction,
                        raw: true
                    });

                    rawFeature.individuals = [];
                    if(individuals) {
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

    equals(a, b) {
        if(a.individuals.length !== b.individuals.length)
            return false;

        let found = a.individuals.every(aIndividual => {
            let r = b.individuals.find(bIndividual => aIndividual.name === bIndividual.name);

            if(r)
                return aIndividual.type.every(aType => r.type.some(bType => aType === bType));

            return false;
        });

        return (found && a.title === b.title && a.number === b.number && a.addinfo === b.addinfo);
    }*/
}

type FeatureDto = ModelObject<Feature>;
