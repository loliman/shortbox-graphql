import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {findOrCrawlIssue} from "./Issue";
import {asyncForEach} from "../util/util";

class Story extends Model {
    static tableName = 'Story';

    static associate(models) {
        Story.hasMany(models.Story, {as: {singular: 'Children', plural: 'Parent'}, foreignKey: 'fk_parent'});

        Story.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Story.belongsToMany(models.Individual, {through: models.Story_Individual, foreignKey: 'fk_story', unique: false});
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
                    resolve(await models.Story_Individual.create({fk_story: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                });
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
        addinfo: {
            type: Sequelize.STRING(255),
            allowNull: false,
            defaultValue: ''
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['fk_issue', 'fk_parent', 'addinfo', 'number']
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
    translators: [IndividualInput],
    writers: [IndividualInput],
    pencilers: [IndividualInput],
    inkers: [IndividualInput],
    colourists: [IndividualInput],
    letterers: [IndividualInput],
    editors: [IndividualInput],
    title: String,
    addinfo: String,
    exclusive: Boolean
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
    exclusive: Boolean,
    pencilers: [Individual],
    writers: [Individual],
    inkers: [Individual],
    colourists: [Individual],
    letterers: [Individual],
    editors: [Individual],
    translators: [Individual]    
  }
`;

export const resolvers = {
    Story: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        addinfo: (parent) => parent.addinfo,
        issue: async (parent) => await models.Issue.findById(parent.fk_issue),
        parent: async (parent) => await models.Story.findById(parent.fk_parent),
        children: async (parent) => await models.Story.findAll({
            where: {fk_parent: parent.id},
            include: [models.Issue],
            group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
            order: [[models.Issue, 'releasedate', 'ASC']]
        }),
        onlyapp: async (parent) => {
            let stories = await models.Story.findAll({
                where: {fk_parent: parent.fk_parent},
                include: [models.Issue],
                group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
                order: [[models.Issue, 'releasedate', 'ASC'], [models.Issue, 'variant', 'ASC']]
            });

            return stories.length === 1;
        },
        firstapp: async (parent) => {
            let stories = await models.Story.findAll({
                where: {fk_parent: parent.fk_parent},
                include: [models.Issue],
                group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
                order: [[models.Issue, 'releasedate', 'ASC'], [models.Issue, 'variant', 'ASC']]
            });

            let firstapp = false;
            if(stories.length > 0 && stories[0]['Issue']) {
                if(stories[0]['Issue'].id === parent.fk_issue)
                    firstapp = true;
                else {
                    let issue = await models.Issue.findOne({
                        where: {id: parent.fk_issue}
                    });

                    if(issue.number === stories[0]['Issue'].number && issue.fk_series === stories[0]['Issue'].fk_series)
                        firstapp = true;
                }
            }

            return firstapp;
        },
        exclusive: async (parent) => {
            return parent.fk_parent === null;
        },
        pencilers: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'PENCILER'
            }
        }),
        writers: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'WRITER'
            }
        }),
        inkers: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'INKER'
            }
        }),
        colourists: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'COLOURIST'
            }
        }),
        letterers: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'LETTERER'
            }
        }),
        editors: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'EDITOR'
            }
        }),
        translators: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'TRANSLATOR'
            }
        })
    }
};

export async function create(story, issue, transaction, us) {
    return new Promise(async (resolve, reject) => {
        try {
            if (story.exclusive || us) {
                let resStory = await models.Story.create({
                    number: !isNaN(story.number) ? story.number : 1,
                    title: story.title ? story.title.trim() : '',
                    addinfo: story.addinfo,
                    fk_issue: issue.id
                }, {transaction: transaction});

                if(story.writers)
                    await asyncForEach(story.writers, async writer => {
                        if(writer.name && writer.name.trim() !== '')
                            await resStory.associateIndividual(writer.name.trim(), 'WRITER', transaction);
                    });

                if(story.pencilers)
                    await asyncForEach(story.pencilers, async penciler => {
                        if(penciler.name && penciler.name.trim() !== '')
                            await resStory.associateIndividual(penciler.name.trim(), 'PENCILER', transaction);
                    });

                if(story.inkers)
                    await asyncForEach(story.inkers, async inker => {
                        if(inker.name && inker.name.trim() !== '')
                            await resStory.associateIndividual(inker.name.trim(), 'INKER', transaction);
                    });

                if(story.colourists)
                    await asyncForEach(story.colourists, async colourist => {
                        if(colourist.name && colourist.name.trim() !== '')
                            await resStory.associateIndividual(colourist.name.trim(), 'COLOURIST', transaction);
                    });

                if(story.letteres)
                    await asyncForEach(story.letterers, async letterer => {
                        if(letterer.name && letterer.name.trim() !== '')
                            await resStory.associateIndividual(letterer.name.trim(), 'LETTERER', transaction);
                    });

                if(story.editors)
                    await asyncForEach(story.editors, async editors => {
                        if(editors.name && editors.name.trim() !== '')
                            await resStory.associateIndividual(editors.name.trim(), 'EDITOR', transaction);
                    });

                await resStory.save();
            } else {
                let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);

                let oStories = await models.Story.findAll({where: {fk_issue: resIssue.id}, order: [['number', 'ASC']], transaction});
                let oStory;

                oStories.forEach(e => {
                    if (e.number === story.parent.number)
                        oStory = e;
                });

                if (!oStory)
                    throw new Error("Story " + story.parent.number + " not found");

                let newStory = await models.Story.create({
                    title: story.title && story.title.trim() ? story.title.trim() : '',
                    number: !isNaN(story.number) ? story.number : 1,
                    addinfo: story.addinfo ? story.addinfo : '',
                    fk_parent: oStory.id
                }, {transaction: transaction});

                if(story.translators)
                    await asyncForEach(story.translators, async translator => {
                        if(translator.name && translator.name.trim() !== '')
                            await newStory.associateIndividual(translator.name.trim(), 'TRANSLATOR', transaction);
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
            let rawStories = await models.Story.findAll({where: {fk_issue: issue.id}, transaction});
            await asyncForEach(rawStories, async story => {
                let rawStory = {};
                rawStory.title = story.title;
                rawStory.number = story.number;
                rawStory.addinfo = story.addinfo;

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

                    let translators = await models.Individual.findAll({
                        include: [{
                            model: models.Story
                        }],
                        where: {
                            '$Stories->Story_Individual.fk_story$': story.id,
                            '$Stories->Story_Individual.type$': 'TRANSLATOR'
                        },
                        transaction
                    });

                    rawStory.translators = [];
                    if(translators)
                        translators.forEach(translator => rawStory.translators.push({name: translator.name}));
                } else {
                    let individuals = ['COLOURIST', 'EDITOR', 'INKER', 'LETTERER', 'PENCILER', 'WRITER'];

                    await asyncForEach(individuals, async type => {
                        let individuals = await models.Individual.findAll({
                            include: [{
                                model: models.Story
                            }],
                            where: {
                                '$Stories->Story_Individual.fk_story$': story.id,
                                '$Stories->Story_Individual.type$': type
                            },
                            transaction
                        });

                        rawStory[type.toLowerCase() + 's'] = [];
                        if(individuals)
                            individuals.forEach(
                                individual => rawStory[type.toLowerCase() + 's'].push({name: individual.name})
                            );
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
    if(a.exclusive !== b.exclusive)
        return false;

    if(a.title !== b.title || a.number !== b.number || a.addinfo !== b.addinfo)
        return false;

    if(!a.exclusive) {
        let found = a.translators.every(aIndividual => {
            return b.translators.some(bIndividual => {
                return aIndividual.name === bIndividual.name;
            });
        });

        return (found &&
          a.parent.number === b.number &&
          a.parent.issue.number === b.parent.issue.number &&
          a.parent.issue.series.title === b.parent.issue.series.title &&
          a.parent.issue.series.volume === b.parent.issue.series.volume
        );
    } else {
        let found = a.colourists.every(aIndividual => {
            return b.colourists.some(bIndividual => {
                return aIndividual.name === bIndividual.name;
            });
        });

        if(!found)
            return false;

        found = a.editors.every(aIndividual => {
            return b.editors.some(bIndividual => {
                return aIndividual.name === bIndividual.name;
            });
        });

        if(!found)
            return false;

        found = a.pencilers.every(aIndividual => {
            return b.pencilers.some(bIndividual => {
                return aIndividual.name === bIndividual.name;
            });
        });
        if(!found)
            return false;

        found = a.writers.every(aIndividual => {
            return b.writers.some(bIndividual => {
                return aIndividual.name === bIndividual.name;
            });
        });

        if(!found)
            return false;

        found = a.letterers.every(aIndividual => {
            return b.letterers.some(bIndividual => {
                return aIndividual.name === bIndividual.name;
            });
        });

        return found;
    }
}