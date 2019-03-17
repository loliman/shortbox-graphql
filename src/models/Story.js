import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Story extends Model {
    static tableName = 'Story';

    static associate(models) {
        Story.hasMany(models.Story, {as: {singular: 'Children', plural: 'Parent'}, foreignKey: 'fk_parent'});

        Story.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Story.belongsToMany(models.Individual, {through: models.Story_Individual, foreignKey: 'fk_story', unique: false});
    }

    async associateIndividual(name, type) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Individual.findOrCreate({
                    where: {
                        name: name
                    }
                }).then(async ([individual, created]) => {
                    resolve(await models.Story_Individual.create({fk_story: this.id, fk_individual: individual.id, type: type}));
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
    translator: IndividualInput,
    writer: IndividualInput,
    penciler: IndividualInput,
    inker: IndividualInput,
    colourist: IndividualInput,
    letterer: IndividualInput,
    editor: IndividualInput,
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
            if(stories.length > 0) {
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

export async function create(story, issue) {
    return new Promise(async (resolve, reject) => {
        try {
            if (story.exclusive) {
                let resStory = await models.Story.create({
                    number: story.number,
                    title: story.title,
                    addinfo: story.addinfo,
                    fk_issue: issue.id
                });

                if (story.writer.name.trim() !== '')
                    await resStory.associateIndividual(story.writer.name.trim(), 'WRITER');

                if (story.penciler.name.trim() !== '')
                    await resStory.associateIndividual(story.writer.name.trim(), 'PENCILER');

                if (story.inker.name.trim() !== '')
                    await resStory.associateIndividual(story.writer.name.trim(), 'COLOURIST');

                if (story.colourist.name.trim() !== '')
                    await resStory.associateIndividual(story.writer.name.trim(), 'WRITER');

                if (story.letterer.name.trim() !== '')
                    await resStory.associateIndividual(story.writer.name.trim(), 'LETTERER');

                if (story.editor.name.trim() !== '')
                    await resStory.associateIndividual(story.writer.name.trim(), 'EDITOR');

                await resStory.save();
            } else {
                let resIssue = await findOrCrawlIssue(story.parent.issue);

                let oStories = await models.Story.findAll({where: {fk_issue: resIssue.id}, order: [['number', 'ASC']]});
                let oStory;

                oStories.forEach(e => {
                    if (e.number === story.parent.number)
                        oStory = e;
                });

                if (!oStory)
                    throw new Error();

                let newStory = await models.Story.create({
                    title: story.title ? story.title : '',
                    number: story.number,
                    addinfo: story.addinfo,
                    fk_parent: oStory.id
                });

                if (story.translator.name.trim() !== '')
                    await newStory.associateIndividual(story.translator.name.trim(), 'TRANSLATOR');
                await newStory.setIssue(res);
                await newStory.save();
            }

            resolve(story);
        } catch (e) {
            reject(e);
        }
    });
}
