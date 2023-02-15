import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {findOrCrawlIssue, getAllChildrenFromTree} from "./Issue";
import {asyncForEach, romanize} from "../util/util";

class Story extends Model {
    static tableName = 'Story';

    static associate(models) {
        Story.hasMany(models.Story, {as: {singular: 'Children', plural: 'Parent'}, foreignKey: 'fk_parent'});
        Story.hasMany(models.Story, {as: {singular: 'ReprintOf', plural: 'Reprints'}, foreignKey: 'fk_reprint'});

        Story.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Story.belongsToMany(models.Individual, {
            through: models.Story_Individual,
            foreignKey: 'fk_story',
            unique: false
        });
        Story.belongsToMany(models.Appearance, {through: models.Story_Appearance, foreignKey: 'fk_story'});
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
                    resolve(await models.Story_Individual.create({
                        fk_story: this.id,
                        fk_individual: individual.id,
                        type: type
                    }, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async associateAppearance(name, type, role, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Appearance.findOrCreate({
                    where: {
                        name: name,
                        type: type
                    },
                    transaction: transaction
                }).then(async ([appearance, created]) => {
                    resolve(await models.Story_Appearance.create({
                        fk_story: this.id,
                        fk_appearance: appearance.id,
                        role: role ? role : ""
                    }, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }
}

export default (sequelize) => {
    Story.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        onlyapp: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        firstapp: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        otheronlytb: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        onlytb: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        onlyoneprint: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        collectedmultipletimes: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        collected: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        addinfo: {
            type: Sequelize.STRING(255),
            allowNull: false,
            defaultValue: ''
        },
        part: {
            type: Sequelize.STRING(255),
            allowNull: false,
            defaultValue: ''
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['fk_issue', 'fk_parent', 'fk_reprint', 'addinfo', 'number']
        }],
        sequelize,
        tableName: Story.tableName
    });

    return Story;
};

export const typeDef = gql`
  input StoryInput {
    id: String,
    number: Int!,
    parent: StoryInput,
    issue: IssueInput,
    individuals: [IndividualInput],
    appearances: [AppearanceInput],
    title: String,
    addinfo: String,
    exclusive: Boolean,
    part: String
  }
  
  type Story {
    id: ID,
    title: String,
    number: Int,
    addinfo: String,
    issue: Issue,
    parent: Story,
    children: [Story],
    onlyapp: Boolean, 
    firstapp: Boolean,
    otheronlytb: Boolean,
    exclusive: Boolean,
    onlyoneprint: Boolean,
    onlytb: Boolean,
    collectedmultipletimes: Boolean,
    collected: Boolean,
    appearances: [Appearance],
    individuals: [Individual],
    reprintOf: Story,
    reprints: [Story],
    part: String 
  }
`;

export const resolvers = {
    Story: {
        id: (parent) => parent.id,
        title: async (parent) => await getReprintOf(parent, (story) => story.title),
        number: (parent) => parent.number,
        addinfo: (parent) => parent.addinfo,
        part: (parent) => parent.part,
        issue: async (parent) => {
            let issue = await models.Issue.findById(parent.fk_issue);
            return await models.Issue.findOne({
                where: {fk_series: issue.fk_series, number: issue.number},
                attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.title')), 'title'],
                    [models.sequelize.fn('MIN', models.sequelize.col('format')), 'format'],
                    [models.sequelize.fn('MIN', models.sequelize.col('variant')), 'variant'],
                    [models.sequelize.fn('MAX', models.sequelize.col('collected')), 'collected'],
                    'number', 'fk_series']
            });
        },
        parent: async (parent) => await models.Story.findById(parent.fk_parent),
        children: async (parent) => {
            if (parent.fk_parent !== null)
                return [];

            return await getAllChildrenFromTree(parent);
        },
        reprintOf: async (parent) => await models.Story.findById(parent.fk_reprint),
        reprints: async (parent) => {
            if (parent.fk_reprint !== null)
                return [];

            return await models.Story.findAll({
                where: {fk_reprint: parent.id},
                include: [{
                    model: models.Issue,
                    attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.title')), 'title'],
                        [models.sequelize.fn('MIN', models.sequelize.col('format')), 'format'],
                        [models.sequelize.fn('MIN', models.sequelize.col('variant')), 'variant'],
                        'number', 'fk_series', 'collected']
                }],
                group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
                order: [[models.Issue, 'releasedate', 'ASC']]
            });
        },
        onlyapp: async (parent) => {
            return parent.onlyapp;
        },
        firstapp: async (parent) => {
            return parent.firstapp;
        },
        otheronlytb: async (parent) => {
            return parent.otheronlytb;
        },
        onlyoneprint: async (parent) => {
            return parent.onlyoneprint;
        },
        onlytb: async (parent) => {
            return parent.onlytb;
        },
        collectedmultipletimes: (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return false;

            return parent.collectedmultipletimes;
        },
        collected: async (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return false;

            return parent.collected;
        },
        exclusive: async (parent) => {
            return parent.fk_parent === null;
        },
        individuals: async (parent) => {
            return await getReprintOf(parent, async (story) => {
                    return await models.Individual.findAll({
                        include: [{
                            model: models.Story
                        }],
                        where: {
                            '$Stories->Story_Individual.fk_story$': story.id
                        }
                    })
                }
            );
        },
        appearances: async (parent) => {
            return await getReprintOf(parent, async (story) => {
                return await models.Appearance.findAll({
                    include: [{
                        model: models.Story
                    }],
                    where: {
                        '$Stories->Story_Appearance.fk_story$': story.id
                    }
                })
            })
        }
    }
}

async function getReprintOf(story, callback) {
    if (story.fk_reprint) {
        let parent = await models.Story.findOne({where: {id: story.fk_reprint}});
        return await getReprintOf(parent, callback);
    } else {
        return await callback(story);
    }
}

export async function create(story, issue, transaction, us) {
    return new Promise(async (resolve, reject) => {
        try {
            if (story.exclusive || us) {
                let resStory = await models.Story.create({
                    number: !isNaN(story.number) ? story.number : 1,
                    title: story.title ? story.title.trim() : '',
                    addinfo: story.addinfo,
                    part: story.part,
                    fk_issue: issue.id
                }, {transaction: transaction});

                if (story.individuals)
                    await asyncForEach(story.individuals, async individual => {
                        if (individual.name && individual.name.trim() !== '')
                            await asyncForEach(individual.type, async type => {
                                await resStory.associateIndividual(individual.name.trim(), type, transaction);
                            });
                    });

                if (story.appearances)
                    await asyncForEach(story.appearances, async appearance => {
                        if (appearance.name && appearance.name.trim() !== '')
                            await resStory.associateAppearance(appearance.name.trim(), appearance.type, appearance.role, transaction);
                    });

                await resStory.save({transaction: transaction});
            } else {
                let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);

                let oStories = await models.Story.findAll({
                    where: {fk_issue: resIssue.id},
                    order: [['number', 'ASC']],
                    transaction
                });
                let oStory;

                oStories.forEach(e => {
                    if (e.number === story.parent.number)
                        oStory = e;
                });

                if (!oStory)
                    throw new Error("Geschichte " + story.parent.issue.series.title + " (Vol." + story.parent.issue.series.volume + ") " + story.parent.issue.number + " [" + romanize(story.parent.number) + "] nicht gefunden");

                let newStory = await models.Story.create({
                    title: story.title && story.title.trim() ? story.title.trim() : '',
                    number: !isNaN(story.number) ? story.number : 1,
                    addinfo: story.addinfo ? story.addinfo : '',
                    part: story.part ? story.part : '',
                    fk_parent: oStory.id
                }, {transaction: transaction});

                if (story.individuals)
                    await asyncForEach(story.individuals, async individual => {
                        if (individual.name && individual.name.trim() !== '')
                            await asyncForEach(individual.type, async type => {
                                await newStory.associateIndividual(individual.name.trim(), type, transaction);
                            });
                    });

                if (story.appearances)
                    await asyncForEach(story.appearances, async appearance => {
                        if (appearance.name && appearance.name.trim() !== '')
                            await newStory.associateAppearance(appearance.name.trim(), appearance.type, appearance.role, transaction);
                    });

                await newStory.setIssue(issue, {transaction: transaction});
                await newStory.save({transaction: transaction});
            }

            resolve(story);
        } catch (e) {
            reject(e);
        }
    });
}

export async function getStories(issue, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            let oldStories = [];
            let rawStories = await models.Story.findAll({
                where: {fk_issue: issue.id},
                order: [['number', 'ASC']],
                transaction
            });

            await asyncForEach(rawStories, async story => {
                let rawStory = {};
                rawStory.title = story.title;
                rawStory.number = story.number;
                rawStory.addinfo = story.addinfo;
                rawStory.part = story.part;

                rawStory.exclusive = story.fk_parent === null;

                if (story.fk_parent !== null) {
                    let rawParent = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
                    let rawIssue = await models.Issue.findOne({where: {id: rawParent.fk_issue}, transaction});
                    let rawSeries = await models.Series.findOne({where: {id: rawIssue.fk_series}, transaction});

                    rawStory.parent = {number: rawParent.number};

                    rawStory.parent.issue = {number: rawIssue.number.toString()};

                    rawStory.parent.issue.series = {
                        title: rawSeries.title,
                        volume: rawSeries.volume,
                    };

                    let individuals = await models.Individual.findAll({
                        include: [{
                            model: models.Story
                        }],
                        where: {
                            '$Stories->Story_Individual.fk_story$': story.id
                        },
                        transaction,
                        raw: true
                    });

                    rawStory.individuals = [];
                    if (individuals) {
                        individuals.forEach(individual => {
                            let i = rawStory.individuals.find(n => n.name === individual.name);

                            if (!i) {
                                i = {name: individual.name, type: []};
                                rawStory.individuals.push(i);
                            }

                            i.type.push(individual["Stories.Story_Individual.type"]);
                        });
                    }
                } else {
                    let individuals = await models.Individual.findAll({
                        include: [{
                            model: models.Story
                        }],
                        where: {
                            '$Stories->Story_Individual.fk_story$': story.id
                        },
                        transaction,
                        raw: true
                    });

                    rawStory.individuals = [];
                    if (individuals)
                        individuals.forEach(individual => {
                            let i = rawStory.individuals.find(n => n.name === individual.name);

                            if (!i) {
                                i = {name: individual.name, type: []};
                                rawStory.individuals.push(i);
                            }

                            i.type.push(individual["Stories.Story_Individual.type"]);
                        });

                    let appearances = await models.Appearance.findAll({
                        include: [{
                            model: models.Story
                        }],
                        where: {
                            '$Stories->Story_Appearance.fk_story$': story.id
                        },
                        transaction,
                        raw: true
                    });

                    rawStory.appearances = [];
                    if (appearances)
                        appearances.forEach(appearance => {
                            let a = {
                                name: appearance.name,
                                type: appearance.type,
                                role: appearance["Stories.Story_Appearance.role"]
                            };
                            rawStory.appearances.push(a);
                        });
                }
                oldStories.push(rawStory);
            });

            resolve(oldStories);
        } catch (e) {
            reject(e);
        }
    });
}

export function equals(a, b) {
    if (a.exclusive !== b.exclusive)
        return false;

    if (a.title !== b.title || a.number !== b.number || a.addinfo !== b.addinfo || a.part !== b.part)
        return false;

    if (a.individuals && !b.individuals)
        return false;

    if (a.appearances && !b.appearances)
        return false;

    if (!a.individuals && b.individuals)
        return false;

    if (!a.appearances && b.appearances)
        return false;

    if ((a.individuals && b.individuals) && (a.individuals.length !== b.individuals.length))
        return false;

    if ((a.appearances && b.appearances) && (a.appearances.length !== b.appearances.length))
        return false;

    let found = a.individuals.every(aIndividual => {
        let r = b.individuals.find(bIndividual => aIndividual.name === bIndividual.name);

        if (r)
            return aIndividual.type.every(aType => r.type.some(bType => aType === bType));

        return false;
    });

    found = found && a.appearances.every(aAppearance => {
        return b.appearances.some(bAppearance => {
            return aAppearance.name === bAppearance.name && aAppearance.type === bAppearance.type && aAppearance.role === bAppearance.role;
        });
    });

    if (!a.exclusive) {
        return (found &&
            a.parent.number === b.number &&
            a.parent.issue.number === b.parent.issue.number &&
            a.parent.issue.series.title === b.parent.issue.series.title &&
            a.parent.issue.series.volume === b.parent.issue.series.volume
        );
    } else {
        return found
    }
}
