import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {findOrCrawlIssue} from "./Issue";
import {asyncForEach} from "../util/util";

class Cover extends Model {
    static tableName = 'Cover';

    static associate(models) {
        Cover.hasMany(models.Cover, {as: {singular: 'Children', plural: 'Parent'}, foreignKey: 'fk_parent'});

        Cover.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Cover.belongsToMany(models.Individual, {through: models.Cover_Individual, foreignKey: 'fk_cover'});
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
                    resolve(await models.Cover_Individual.create({fk_cover: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }
}

export default (sequelize) => {
    Cover.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        url: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        },
        /*Front means 0*/
        number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        coloured: {
            type: Sequelize.BOOLEAN,
            defaultValue: 1
        },
        fullsize: {
            type: Sequelize.BOOLEAN,
            defaultValue: 1
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        },
        onlyapp: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstapp: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstpartly: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstcomplete: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstmonochrome: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstcoloured: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstsmall: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        firstfullsize: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        onlytb: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        onlyoneprint: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        onlypartly: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        onlymonochrome: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        },
        onlysmall: {
            type: Sequelize.BOOLEAN,
            defaultValue: 0
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['fk_parent', 'fk_issue', 'number']
        }],
        sequelize,
        tableName: Cover.tableName
    });

    return Cover;
};

export const typeDef = gql`
 input CoverInput {
    number: Int!,
    parent: CoverInput,
    issue: IssueInput,
    individuals: [IndividualInput],
    addinfo: String,
    coloured: Boolean,
    fullsize: Boolean,
    exclusive: Boolean
  }
  
  type Cover {
    id: ID,
    url: String,
    number: Int,
    addinfo: String,
    parent: Cover,
    children: [Cover],
    
    exclusive: Boolean,
    
    onlyapp: Boolean, 
    firstapp: Boolean,
    firstpartly: Boolean,
    firstcomplete: Boolean,
    firstmonochrome: Boolean,
    firstcoloured: Boolean,
    firstsmall: Boolean,
    firstfullsize: Boolean,
    onlytb: Boolean,
    onlyoneprint: Boolean,
    onlypartly: Boolean,
    onlymonochrome: Boolean,
    onlysmall: Boolean,
    
    coloured: Boolean,
    fullsize: Boolean,
    issue: Issue,
    individuals: [Individual]
  }
`;

export const resolvers = {
    Cover: {
        id: (parent) => parent.id,
        url: (parent) => parent.url,
        number: (parent) => parent.number,
        parent: async (parent) => await models.Cover.findById(parent.fk_parent),
        issue: async (parent) => await models.Issue.findById(parent.fk_issue),
        children: async (parent) => {
            if(parent.fk_parent !== null)
                return [];

            return await models.Cover.findAll({
                where: {fk_parent: parent.id},
                include: [models.Issue],
                group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
                order: [[models.Issue, 'releasedate', 'ASC']]
            })
        },
        coloured: async (parent) => {
            return parent.coloured;
        },
        onlyapp: async (parent) => {
            return parent.onlyapp;
        },
        firstapp: async (parent) => {
            return parent.firstapp;
        },
        firstpartly: async (parent) => {
            return parent.firstpartly;
        },
        firstcomplete: async (parent) => {
            return parent.firstcomplete;
        },
        firstmonochrome: async (parent) => {
            return parent.firstmonochrome;
        },
        firstcoloured: async (parent) => {
            return parent.firstcoloured;
        },
        firstsmall: async (parent) => {
            return parent.firstsmall;
        },
        firstfullsize: async (parent) => {
            return parent.firstfullsize;
        },
        exclusive: async (parent) => {
            return parent.fk_parent === null;
        },
        onlytb: async (parent) => {
            return parent.onlytb;
        },
        onlyoneprint: async (parent) => {
            return parent.onlyoneprint;
        },
        onlymonochrome: async (parent) => {
            return parent.onlymonochrome;
        },
        onlypartly: async (parent) => {
            return parent.onlypartly;
        },
        onlysmall: async (parent) => {
            return parent.onlysmall;
        },
        addinfo: (parent) => parent.addinfo,
        individuals: async (parent) => {
            if(parent.fk_parent !== null)
                return [];

            return await models.Individual.findAll({
                include: [{
                    model: models.Cover
                }],
                where: {
                    '$Covers->Cover_Individual.fk_cover$': parent.id
                }
            })
        }
    }
};

export async function create(cover, issue, coverUrl, transaction, us) {
    return new Promise(async (resolve, reject) => {
        try {
            if (cover.exclusive || us) {
                let resCover = await models.Cover.create({
                    number: !isNaN(cover.number) ? cover.number : 1,
                    url: cover.number === 0 ? coverUrl : '',
                    addinfo: cover.addinfo,
                    fullsize: cover.fullsize,
                    coloured: cover.coloured,
                    fk_issue: issue.id
                }, {transaction: transaction});

                if(cover.individuals)
                    await asyncForEach(cover.individuals, async individual => {
                        if(individual.name && individual.name.trim() !== '')
                            await asyncForEach(individual.type, async type => {
                                await resCover.associateIndividual(individual.name.trim(), type, transaction);
                            });
                    });

                await resCover.save({transaction: transaction});
            } else {
                let resIssue = await findOrCrawlIssue(cover.parent.issue, transaction);

                let oVariants = await models.Issue.findAll({
                    where: {
                        fk_series: resIssue.fk_series,
                        number: resIssue.number
                    },
                    order: [['number', 'ASC']],
                    transaction
                });
                let oVariant;

                oVariants.forEach(e => {
                    if (e.variant === cover.parent.issue.variant.trim())
                        oVariant = e;
                });

                if (!oVariant)
                    throw new Error("Variant " + cover.parent.issue.series.title + " (Vol." + cover.parent.issue.series.volume + ") " + cover.parent.issue.number + " [" + cover.parent.issue.variant + "] nicht gefunden");

                let oCover = await models.Cover.findOne({where: {fk_issue: oVariant.id}}, transaction);
                let newCover = await models.Cover.create({
                    url: cover.number === 0 ? coverUrl : '',
                    number: !isNaN(cover.number) ? cover.number : 1,
                    addinfo: cover.addinfo,
                    fullsize: cover.fullsize,
                    coloured: cover.coloured,
                    fk_parent: oCover.id
                }, {transaction: transaction});

                await newCover.setIssue(issue, {transaction: transaction});
                await newCover.save({transaction: transaction});
            }

            resolve(cover);
        } catch (e) {
            reject(e);
        }
    });
}

export async function getCovers(issue, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            let oldCovers = [];
            let rawCovers = await models.Cover.findAll({where: {fk_issue: issue.id}, transaction});
            await asyncForEach(rawCovers, async cover => {
                let rawCover = {};
                rawCover.number = cover.number;
                rawCover.addinfo = cover.addinfo;
                rawCover.url = cover.url;

                rawCover.exclusive = cover.fk_parent === null;

                if(cover.fk_parent !== null) {
                    let rawParent = await models.Cover.findOne({where: {id: cover.fk_parent}, transaction});
                    let rawIssue = await models.Issue.findOne({where: {id: rawParent.fk_issue}, transaction});
                    let rawSeries = await models.Series.findOne({where: {id: rawIssue.fk_series}, transaction});

                    rawCover.parent = {};

                    rawCover.parent.issue = {
                        number: rawIssue.number.toString(),
                        variant: rawIssue.variant
                    };

                    rawCover.parent.issue.series = {
                        title: rawSeries.title,
                        volume: rawSeries.volume,
                    };
                } else {
                    let individuals = await models.Individual.findAll({
                        include: [{
                            model: models.Cover
                        }],
                        where: {
                            '$Covers->Cover_Individual.fk_cover$': cover.id
                        },
                        transaction,
                        raw: true
                    });

                    rawCover.individuals = [];
                    if(individuals) {
                        individuals.forEach(individual => {
                            let i = rawCover.individuals.find(n => n.name === individual.name);

                            if (!i) {
                                i = {name: individual.name, type: []};
                                rawCover.individuals.push(i);
                            }

                            i.type.push(individual["Stories.Cover_Individual.type"]);
                        });
                    }
                }

                oldCovers.push(rawCover);
            });

            resolve(oldCovers);
        } catch (e) {
            reject(e);
        }
    });
}

export function equals(a, b) {
    if(a.exclusive !== b.exclusive)
        return false;

    if(a.coloured !== b.coloured)
        return false;

    if(a.fullsize !== b.fullsize)
        return false;

    if(a.number !== b.number || a.addinfo !== b.addinfo)
        return false;

    if(!a.exclusive) {
        return (
            a.parent.issue.number === b.parent.issue.number &&
            a.parent.issue.variant === b.parent.issue.variant &&
            a.parent.issue.series.title === b.parent.issue.series.title &&
            a.parent.issue.series.volume === b.parent.issue.series.volume
        );
    } else {
        if(a.individuals.length !== b.individuals.length)
            return false;

        return a.individuals.every(aIndividual => {
            let r = b.individuals.find(bIndividual => aIndividual.name === bIndividual.name);

            if(r)
                return aIndividual.type.every(aType => r.type.some(bType => aType === bType));

            return false;
        });
    }
}
