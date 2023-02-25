import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach, deleteFile, storeFile} from "../util/util";
import {crawlIssue, crawlSeries} from "../crawler/crawler_marvel";
import {coverDir} from "../config/config";
import {create as createStory, equals as storyEquals, getStories} from "./Story";
import {create as createCover, equals as coverEquals, getCovers} from "./Cover";
import {create as createFeature, equals as featureEquals, getFeatures} from "./Feature";
import {create as createArc} from "./Arc";
import {createFilterQuery} from "../graphql/Filter";
import request from "request-promise";

class Issue extends Model {
    static tableName = 'Issue';

    static associate(models) {
        Issue.hasMany(models.Story, {
            as: {singular: 'Issue', plural: 'Stories'},
            foreignKey: 'fk_issue',
            onDelete: 'cascade'
        });
        Issue.hasMany(models.Cover, {foreignKey: 'fk_issue', onDelete: 'cascade'});

        Issue.belongsTo(models.Series, {foreignKey: 'fk_series'});
        Issue.belongsToMany(models.Individual, {through: models.Issue_Individual, foreignKey: 'fk_issue'});
        Issue.belongsToMany(models.Arc, {through: models.Issue_Arc, foreignKey: 'fk_issue'});
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
                    resolve(await models.Issue_Individual.create({
                        fk_issue: this.id,
                        fk_individual: individual.id,
                        type: type
                    }, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async associateArc(title, type, transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Arc.findOrCreate({
                    where: {
                        title: title,
                        type: type
                    },
                    transaction: transaction
                }).then(async ([arc, created]) => {
                    resolve(await models.Issue_Arc.create({
                        fk_issue: this.id,
                        fk_arc: arc.id
                    }, {transaction: transaction}));
                }).catch(e => reject(e));
            } catch (e) {
                reject(e);
            }
        });
    }

    async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let cover = await models.Cover.findOne({where: {fk_issue: this.id, number: 0}, transaction});
                if (cover)
                    if (!cover.url.indexOf('http') === 0)
                        deleteFile(cover.url);

                await models.Story.destroy({where: {fk_issue: this.id}, transaction});
                await models.Feature.destroy({where: {fk_issue: this.id}, transaction});
                await models.Cover.destroy({where: {fk_issue: this.id}, transaction});

                let del = await this.destroy({transaction});
                resolve(del);
            } catch (e) {
                reject(e);
            }
        });
    }
}

export default (sequelize) => {
    Issue.init({
        id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(255),
            allowNull: false,
            defaultValue: ''
        },
        number: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        format: {
            type: Sequelize.STRING(255),
            allowNull: false,
            defaultValue: ''
        },
        limitation: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0
        },
        variant: {
            type: Sequelize.STRING(255),
            allowNull: false,
            defaultValue: ''
        },
        releasedate: {
            type: Sequelize.DATE,
            allowNull: true
        },
        pages: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0
        },
        comicguideid: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0
        },
        price: {
            type: Sequelize.FLOAT,
            allowNull: true
        },
        currency: {
            type: Sequelize.STRING,
            allowNull: true
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        },
        verified: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        collected: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['number', 'fk_series', 'format', 'variant']
        }, {
            fields: ['id']
        }, {
            fields: ['number', 'format', 'variant']
        }],
        sequelize,
        tableName: Issue.tableName
    });

    return Issue;
};

export const typeDef = gql`
  extend type Mutation {
    deleteIssue(item: IssueInput!): Boolean,
    createIssue(item: IssueInput!): Issue,
    editIssue(old: IssueInput!, item: IssueInput!): Issue,
    verifyIssue(item: IssueInput!): Issue,
    addIssueToCollection(item: IssueInput!): Issue
  }
  
  extend type Query {
    issues(pattern: String, series: SeriesInput! filter: Filter): [Issue], 
    lastEdited(filter: Filter, offset: Int, order: String, direction: String): [Issue],
    issue(issue: IssueInput!, edit: Boolean): Issue
  }
    
  input IssueInput {
    id: String,
    title: String,
    series: SeriesInput!,
    number: String!,
    format: String,
    variant: String,
    limitation: Int,
    cover: Upload,
    pages: Int,
    releasedate: Date,
    price: String,
    currency: String,
    individuals: [IndividualInput],
    addinfo: String,
    stories: [StoryInput],
    features: [FeatureInput],
    covers: [CoverInput],
    arcs: [ArcInput],
    comicguideid: Int
  }
  
  type Issue {
    id: ID,
    format: String,
    limitation: Int,
    cover: Cover,
    price: String,
    currency: String,
    title: String,
    number: String,
    series: Series,
    pages: Int,
    releasedate: Date,
    arcs: [Arc]
    features: [Feature],
    stories: [Story],
    covers: [Cover],
    variants: [Issue],
    variant: String,
    verified: Boolean,
    collected: Boolean,
    addinfo: String,
    individuals: [Individual],
    comicguideid: Int,
    createdAt: DateTime,
    updatedAt: DateTime
  }
`;

export const resolvers = {
    Query: {
        issues: async (_, {pattern, series, filter}, context) => {
            const {loggedIn, transaction} = context;

            if (!filter) {
                let res = await models.Issue.findAll({
                    attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.title')), 'title'],
                        [models.sequelize.fn('MIN', models.sequelize.col('format')), 'format'],
                        [models.sequelize.fn('MIN', models.sequelize.col('variant')), 'variant'],
                        [models.sequelize.cast(models.sequelize.col('number'), 'unsigned'), 'numberasint'],
                        [models.sequelize.fn('fromRoman', models.sequelize.col('number')), 'numberfromroman'],
                        'number', 'releasedate', 'fk_series', 'collected'],
                    where: {
                        '$Series.title$': series.title,
                        '$Series.volume$': series.volume,
                        '$Series->Publisher.name$': series.publisher.name
                    },
                    order: [[models.sequelize.literal('numberasint'), 'ASC'],
                        [models.sequelize.literal('numberfromroman'), 'ASC'],
                        ['releasedate', 'ASC'],
                        ['number', 'ASC'],
                        [models.sequelize.literal('variant'), 'DESC'],
                        [models.sequelize.literal('title'), 'DESC'],
                        [models.sequelize.literal('format'), 'DESC']],
                    group: ['fk_series', 'number'],
                    include: [
                        {
                            model: models.Series,
                            include: [
                                models.Publisher
                            ]
                        }
                    ],
                });

                return res;
            } else {
                let rawQuery = createFilterQuery(loggedIn, series, filter);
                let res = await models.sequelize.query(rawQuery);
                let issues = [];
                res[0].forEach(i => issues.push({
                    number: i.issuenumber,
                    title: i.issuetitle,
                    fk_series: i.seriesid,
                    format: i.issueformat,
                    variant: i.issuevariant,
                    collected: i.issuecollected
                }));

                return issues;
            }
        },
        lastEdited: async (_, {filter, offset, order, direction}, context) => {
            const {loggedIn, transaction} = context;

            let rawQuery = createFilterQuery(loggedIn, filter.us, filter, offset, false, true, order, direction);
            let res = await models.sequelize.query(rawQuery);

            let issues = [];
            res[0].forEach(i => issues.push({
                id: i.issueid,
                comicguideid: i.comicguideid,
                number: i.issuenumber,
                updatedAt: i.updatedAt,
                createdAt: i.createdAt,
                title: i.issuetitle,
                fk_series: i.seriesid,
                format: i.issueformat,
                variant: i.issuevariant,
                verified: i.issueverified,
                collected: i.issuecollected
            }));

            return issues;
        },
        issue: async (_, {issue, edit}) => {
            let where = {
                number: issue.number,
                '$Series.title$': issue.series.title,
                '$Series.volume$': issue.series.volume,
                '$Series->Publisher.name$': issue.series.publisher.name
            };

            if (issue.format)
                where.format = issue.format;

            if (issue.variant)
                where.variant = issue.variant;

            let res = await models.Issue.findOne({
                where: where,
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });

            if (res)
                res.edit = (edit === true);

            return res;
        }
    },
    Mutation: {
        deleteIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let series = await models.Series.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$Publisher.name$': item.series.publisher.name.trim()
                    },
                    include: [models.Publisher],
                    transaction
                });

                let where = {
                    number: item.number.trim(),
                    fk_series: series.id
                };

                if (item.format)
                    where.format = item.format.trim();

                if (item.variant)
                    where.variant = item.variant.trim();

                let issue = await models.Issue.findOne({
                    where: where,
                    transaction
                });

                let del = await issue.delete(transaction);

                await transaction.commit();

                return del !== null;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        createIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await create(item, transaction);

                if (!item.series.publisher.us)
                    await updateIssueTags(res, transaction);

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        editIssue: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let oldPub = await models.Publisher.findOne({
                    where: {
                        name: old.series.publisher.name.trim()
                    },
                    transaction
                });

                let newPub = await models.Publisher.findOne({
                    where: {
                        name: old.series.publisher.name.trim()
                    },
                    transaction
                });

                if (oldPub.original !== newPub.original)
                    throw new Error("You must not change to another publisher type");

                let where = {
                    number: old.number.trim(),
                    '$Series.title$': old.series.title.trim(),
                    '$Series.volume$': old.series.volume,
                    '$Series->Publisher.name$': old.series.publisher.name.trim()
                };

                if (old.format)
                    where.format = old.format.trim();

                if (old.variant)
                    where.variant = old.variant.trim();

                let newSeries = await models.Series.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$Publisher.name$': item.series.publisher.name.trim()
                    },
                    include: [models.Publisher],
                    transaction
                });

                let res = await models.Issue.findOne({
                    where: where,
                    include: [
                        {
                            model: models.Series,
                            include: [
                                models.Publisher
                            ]
                        }
                    ],
                    transaction
                });

                let releasedate = item.releasedate;

                res.title = item.title ? item.title.trim() : '';
                res.number = item.number.trim();
                res.setSeries(newSeries, {transaction: transaction});
                res.format = item.format ? item.format.trim() : 'Heft';
                res.variant = item.variant ? item.variant.trim() : '';
                res.limitation = item.limitation;
                res.pages = item.pages;
                res.releasedate = releasedate;
                res.price = !isNaN(item.price) && item.price !== '' ? item.price : '0';
                res.currency = item.currency ? item.currency.trim() : '';
                res.addinfo = item.addinfo;
                res.comicguideid = item.comicguideid;

                res = await res.save({transaction: transaction});

                let cover = await models.Cover.findOne({where: {fk_issue: res.id, number: 0}, transaction});

                let coverUrl = '';

                if (item.cover === '') { //Cover has been deleted
                    if (cover) {
                        if (!cover.url.indexOf('http') === 0)
                            deleteFile(cover.url);
                        await cover.destroy({transaction});
                    }
                } else if (item.cover instanceof Promise) { //Cover has been changed
                    if (cover) {
                        if (!cover.url.indexOf('http') === 0)
                            deleteFile(cover.url);
                        await cover.destroy({transaction});
                    }

                    coverUrl = await createCoverForIssue(item.cover, item.covers, res, transaction);
                } // else nothing has changed

                let us = item.series.publisher.us;

                if (us && item.individuals.length > 0) {
                    await models.Issue_Individual.destroy({where: {fk_issue: res.id}, transaction});

                    await asyncForEach(item.individuals, async individual => {
                        if (individual.name && individual.name.trim() !== '')
                            await res.associateIndividual(individual.name.trim(), individual.type, transaction);
                    });

                    await res.save({transaction: transaction});
                }

                if (us && item.arcs && item.arcs.length > 0) {
                    await models.Issue_Arc.destroy({where: {fk_issue: res.id}, transaction});

                    await asyncForEach(item.arcs, async arc => {
                        if (arc.title && arc.title.trim() !== '')
                            await res.associateArc(arc.title.trim(), arc.type, transaction);
                    });

                    await res.save({transaction: transaction});
                }

                let oldStories = await getStories(res, transaction);

                let deletedStories = oldStories.filter(o => {
                    let found = false;
                    item.stories.forEach(n => {
                        if (!found)
                            found = storyEquals(o, n);
                    });
                    return !found;
                });

                if (us)
                    deletedStories.forEach(deletedStory => {
                        if (!deletedStory.exclusive)
                            throw Error('You must not delete original stories with children');
                    });

                await asyncForEach(deletedStories, async story => {
                    let resStory = await models.Story.findOne({
                        where: {
                            number: story.number,
                            fk_issue: res.id
                        },
                        transaction
                    });

                    await resStory.destroy({transaction: transaction});
                });

                let newStories = item.stories.filter(n => {
                    let found = false;
                    oldStories.forEach(o => {
                        if (!found)
                            found = storyEquals(n, o);
                    });
                    return !found;
                });

                if (item.stories) {
                    let stories = [];
                    await asyncForEach(newStories, async (story) => {
                        if (story.parent && story.parent.number === 0) {
                            let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);
                            let oStories = await models.Story.findAll({
                                where: {fk_issue: resIssue.id},
                                order: [['number', 'ASC']],
                                transaction
                            });

                            for (let i = 0; i < oStories.length; i++) {
                                stories.push({
                                    number: stories.length + 1,
                                    parent: {number: i + 1, issue: story.parent.issue},
                                    individuals: story.individuals,
                                    addinfo: '',
                                    part: '',
                                    exclusive: false
                                });
                            }
                        } else {
                            stories.push(story);
                        }
                    });

                    await asyncForEach(stories, async (story) => await createStory(story, res, transaction, us));
                }

                if (!us) {
                    let oldFeatures = await getFeatures(res, transaction);

                    let deletedFeatures = oldFeatures.filter(o => {
                        let found = false;
                        item.features.forEach(n => {
                            if (!found)
                                found = featureEquals(o, n);
                        });
                        return !found;
                    });

                    await asyncForEach(deletedFeatures, async (feature) => {
                        await models.Feature.destroy({
                            where: {
                                number: feature.number,
                                fk_issue: res.id
                            },
                            transaction
                        })
                    });

                    let newFeatures = item.features.filter(n => {
                        let found = false;
                        oldFeatures.forEach(o => {
                            if (!found)
                                found = featureEquals(n, o);
                        });
                        return !found;
                    });

                    await asyncForEach(newFeatures, async feature => await createFeature(feature, res, transaction));
                }

                let oldCovers = await getCovers(res, transaction);

                let deletedCovers = oldCovers.filter(o => {
                    let found = false;
                    item.covers.forEach(n => {
                        if (!found)
                            found = coverEquals(o, n);
                    });

                    if (o.number === 0 && coverUrl !== '')
                        found = true;

                    return !found;
                });

                if (us)
                    deletedCovers.forEach(deletedCover => {
                        if (!deletedCover.exclusive)
                            throw Error('You must not delete original covers with children');
                    });

                await asyncForEach(deletedCovers, async cover => {
                    let resCover = await models.Cover.findOne({
                        where: {
                            number: cover.number,
                            fk_issue: res.id
                        },
                        transaction
                    });

                    await resCover.destroy({transaction: transaction});
                });

                let newCovers = item.covers.filter(n => {
                    let found = false;
                    oldCovers.forEach(o => {
                        if (!found)
                            found = coverEquals(n, o);
                    });

                    if (n.number === 0 && coverUrl !== '')
                        found = false;

                    return !found;
                });

                let url;
                newCovers.forEach(cover => {
                    if (cover.number === 0)
                        url = '';
                });

                if (url === '') {
                    deletedCovers.forEach(cover => {
                        if (cover.number === 0)
                            url = cover.url;
                    });
                }

                await asyncForEach(newCovers, async cover => {
                    if (url && url !== '' && cover.number === 0)
                        coverUrl = url;

                    await createCover(cover, res, coverUrl, transaction, us);
                });

                if (!item.series.publisher.us) {
                    await updateIssueTags(res, transaction);
                    await updateStoryTags(oldStories, transaction);
                }

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        verifyIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let where = {
                    number: item.number.trim(),
                    '$Series.title$': item.series.title.trim(),
                    '$Series.volume$': item.series.volume,
                    '$Series->Publisher.name$': item.series.publisher.name.trim()
                };

                if (item.format)
                    where.format = item.format.trim();

                if (item.variant)
                    where.variant = item.variant.trim();

                let res = await models.Issue.findOne({
                    where: where,
                    include: [
                        {
                            model: models.Series,
                            include: [
                                models.Publisher
                            ]
                        }
                    ],
                    transaction
                });

                res.verified = !res.verified;
                res = await res.save({transaction: transaction});
                await updateIssueTags(res, transaction);

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        addIssueToCollection: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let where = {
                    number: item.number.trim(),
                    '$Series.title$': item.series.title.trim(),
                    '$Series.volume$': item.series.volume,
                    '$Series->Publisher.name$': item.series.publisher.name.trim()
                };

                if (item.format)
                    where.format = item.format.trim();

                if (item.variant)
                    where.variant = item.variant.trim();

                let res = await models.Issue.findOne({
                    where: where,
                    include: [
                        {
                            model: models.Series,
                            include: [
                                models.Publisher
                            ]
                        }
                    ],
                    transaction
                });

                res.collected = !res.collected;
                res = await res.save({transaction: transaction});
                await updateIssueTags(res, transaction);

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },
    Issue: {
        id: (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return new Date();

            return parent.id;
        },
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        format: (parent) => parent.format,
        series: async (parent) => models.Series.findById(parent.fk_series),
        variants: async (parent) => {
            let variants = await models.Issue.findAll({
                where: {fk_series: parent.fk_series, number: parent.number},
                order: [['variant', 'ASC'], ['title', 'ASC'], ['format', 'ASC'], ['releasedate', 'ASC']]
            });

            variants.forEach(variant => variant.edit = true);

            return variants;
        },
        variant: (parent) => parent.variant,
        features: async (parent) => {
            if ((await (await parent.getSeries()).getPublisher()).original)
                return [];

            let features = await models.Feature.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]});

            if (features.length === 0 && !parent.edit) {
                let issue = await models.Issue.findOne({
                    where: {fk_series: parent.fk_series, number: parent.number},
                    order: [['releasedate', 'ASC'], ['createdAt', 'ASC'], ['variant', 'ASC']]
                });

                features = await models.Feature.findAll({where: {fk_issue: issue.id}, order: [['number', 'ASC']]});
            }

            return features;
        },
        stories: async (parent, context) => {
            let stories = await models.Story.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]});

            if (stories.length === 0 && !parent.edit) {
                let issues = await models.Issue.findAll({
                    where: {fk_series: parent.fk_series, number: parent.number},
                    order: [['createdAt', 'ASC']]
                });

                await asyncForEach(issues, async issue => {
                    let issueStories = await models.Story.findAll({
                        where: {fk_issue: issue.id},
                        order: [['number', 'ASC']]
                    });

                    if (issueStories && issueStories.length > 0 && stories.length === 0)
                        stories = issueStories;
                });
            }

            return stories;
        },
        covers: async (parent) => {
            return await models.Cover.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]});
            ;
        },
        limitation: (parent) => parent.limitation,
        cover: async (parent) => {
            let cover = await models.Cover.findOne({where: {fk_issue: parent.id, number: 0}});
            if (cover)
                return cover;

            if (parent.comicguideid && parent.comicguideid !== 0) {
                let url = "https://www.comicguide.de/pics/large/" + parent.comicguideid + ".jpg";
                let isImage;

                try {
                    isImage = await request({
                        uri: url,
                        transform: (body, response) => {
                            return response.headers['content-type'] === 'image/jpeg';
                        },
                    });
                } catch (e) {
                    return null;
                }

                if (isImage)
                    return {
                        url: url
                    };
                else return null;
            }
        },
        price: (parent) => (typeof parent.price === 'string') ? parent.price : parent.price.toFixed(2).toString(),
        currency: (parent) => parent.currency,
        pages: (parent) => parent.pages,
        releasedate: (parent) => parent.releasedate,
        verified: (parent) => parent.verified,
        collected: (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return false;

            return parent.collected;
        },
        addinfo: (parent) => parent.addinfo,
        comicguideid: (parent) => parent.comicguideid,
        arcs: async (parent) => {
            if (!(await (await parent.getSeries()).getPublisher()).original)
                return [];

            let issues = await models.Issue.findAll({
                where: {fk_series: parent.fk_series, number: parent.number},
                order: [['createdAt', 'ASC']]
            });

            return await models.Arc.findAll({
                include: [{
                    model: models.Issue
                }],
                where: {
                    '$Issues->Issue_Arc.fk_issue$': issues[0].id
                }
            })
        },
        individuals: async (parent) => {
            if (!(await (await parent.getSeries()).getPublisher()).original)
                return [];

            return await models.Individual.findAll({
                include: [{
                    model: models.Issue
                }],
                where: {
                    '$Issues->Issue_Individual.fk_issue$': parent.id
                }
            })
        },
        createdAt: (parent) => parent.createdAt,
        updatedAt: (parent) => parent.updatedAt
    }
};

export async function updateIssueTags(issue, transaction) {
    let stories = await models.Story.findAll({where: {fk_issue: issue.id}, transaction});

    await updateStoryTags(stories, transaction);
}

export async function updateStoryTags(stories, transaction) {
    await asyncForEach(stories, async (story) => {
        let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});

        if (!parentStory)
            return;

        //DE
        await updateOnlyAppTag(story, transaction);
        await updateFirstAppTag(story, transaction);
        await updateOtherOnlyTbTag(story, transaction);
        await updateCollected(story, transaction)

        //US
        await updateOnlyOnePrintTag(story, transaction);
        await updateOnlyTbTag(story, transaction);

        await updatePartly(story, transaction);
    });
}

async function updatePartly(story, transaction) {
    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});

    let stories = await getAllChildrenFromTree(parentStory, transaction);

    let firstApp = stories.filter(story => story.firstapp)[0];
    if (firstApp.part) {
        let of = firstApp.part.split("/")[1];
        let amount = 0;

        await asyncForEach(stories, async (story) => {
            let ofInner = story.part ? story.part.split("/")[1] : 0;

            if (of === ofInner) {
                amount++;
                story.firstapp = true;
            } else {
                story.firstapp = false;
            }

            await story.save({transaction: transaction});
        });

        if (of === 'x' || amount !== of) {
            let firstComplete = stories.filter(story => !story.part || story.part === "")[0];

            if (firstComplete) {
                firstComplete.firstapp = true;
                await firstComplete.save({transaction: transaction});
            }
        }

        if (amount === stories.length) {
            await asyncForEach(stories, async (story) => {
                story.onlyapp = true;
                await story.save({transaction: transaction});
            });

            parentStory.onlyoneprint = true;
            await parentStory.save({transaction: transaction});
        }
    }
}

async function updateFirstAppTag(story, transaction) {
    if (story.fk_parent === null)
        return;

    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
    let stories = await getAllChildrenFromTree(parentStory, transaction);

    await asyncForEach(stories, async (story) => {
        let firstapp = false;

        if (stories.length > 0 && stories[0]['Issue']) {
            if (stories[0]['Issue'].id === story.fk_issue)
                firstapp = true;
            else {
                let issue = await models.Issue.findOne({
                    where: {id: story.fk_issue}
                });

                if (!issue)
                    return;

                if (issue.number === stories[0]['Issue'].number && issue.fk_series === stories[0]['Issue'].fk_series)
                    firstapp = true;
            }
        }

        story.firstapp = firstapp;
        await story.save({transaction: transaction});
    })
}

async function updateOnlyAppTag(story, transaction) {
    if (story.fk_parent === null)
        return;

    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
    let stories = await getAllChildrenFromTree(parentStory, transaction);

    await asyncForEach(stories, async (story) => {
        story.onlyapp = stories.length === 1;
        await story.save({transaction: transaction});
    })
}

async function updateOnlyTbTag(story, transaction) {
    if (story.fk_parent === null)
        return;

    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
    let stories = await getAllChildrenFromTree(parentStory, transaction);

    await asyncForEach(stories, async (story) => {
        let tbStories = stories.filter(story => story.Issue.format === 'Taschenbuch');

        parentStory.onlytb = tbStories.length > 0 && (tbStories.length === stories.length);
        await parentStory.save({transaction: transaction});
    })
}

async function updateOnlyOnePrintTag(story, transaction) {
    if (story.fk_parent === null)
        return;

    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
    let stories = await getAllChildrenFromTree(parentStory, transaction);

    await asyncForEach(stories, async (story) => {
        parentStory.onlyoneprint = stories.length === 1;
        await parentStory.save({transaction: transaction});
    })
}

async function updateCollected(story, transaction) {
    if (story.fk_parent === null)
        return;

    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
    let stories = await getAllChildrenFromTree(parentStory, transaction);

    let atLeastOneComplete = stories.filter(s => !s.part || s.part === '').length > 0;
    let collected = stories.filter(s => s.Issue.collected).length;

    if (collected > 1 && atLeastOneComplete) {
        parentStory.collectedmultipletimes = true;
    } else {
        parentStory.collectedmultipletimes = false;
    }

    if (collected === 1) {
        parentStory.collected = 1;
    }

    await parentStory.save({transaction: transaction});
}

async function updateOtherOnlyTbTag(story, transaction) {
    if (story.fk_parent === null)
        return;

    let parentStory = await models.Story.findOne({where: {id: story.fk_parent}, transaction});
    let stories = await getAllChildrenFromTree(parentStory, transaction);

    await asyncForEach(stories, async (story) => {
        if (story.Issue.format === "Taschenbuch") {
            story.otheronlytb = false;
        } else {
            let tbStories = stories.filter(story => story.Issue.format === 'Taschenbuch');
            story.otheronlytb = tbStories.length > 0 && (tbStories.length === (stories.length - 1));
        }

        await story.save({transaction: transaction});
    })
}

async function getAllChildren(story, transaction) {
    let stories = await models.Story.findAll({
        transaction,
        where: {fk_parent: story.id},
        include: [{
            model: models.Issue,
            attributes: ['id', 'number', 'fk_series', 'format', 'releasedate', 'collected']
        }],
        order: [[models.Issue, 'releasedate', 'ASC'], ['part', 'DESC']]
    });

    let reprints = await models.Story.findAll({
        where: {fk_reprint: story.id}, transaction,
    });

    await asyncForEach(reprints, async (reprint) => {
        stories = stories.concat(await getAllChildren(reprint, transaction));
    })

    return stories;
}

export async function getAllChildrenFromTree(story, transaction) {
    while (story.fk_reprint) {
        story = await models.Story.findOne({
            where: {id: story.fk_reprint}, transaction
        })
    }

    let stories = await getAllChildren(story, transaction);

    stories = stories.sort((a, b) => {
        return new Date(b.Issue.releasedate) - new Date(a.Issue.releasedate)
    }).reverse();

    return stories;
}

export async function create(item, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            let series = await models.Series.findOne({
                where: {
                    title: item.series.title.trim(),
                    volume: item.series.volume,
                    '$Publisher.name$': item.series.publisher.name.trim()
                },
                include: [models.Publisher],
                transaction
            });

            let releasedate = item.releasedate;

            let res = await models.Issue.create({
                title: item.title ? item.title.trim() : '',
                fk_series: series.id,
                number: item.number.trim(),
                format: item.format ? item.format.trim() : '',
                variant: item.variant ? item.variant.trim() : '',
                limitation: !isNaN(item.limitation) ? item.limitation : 0,
                pages: !isNaN(item.pages) ? item.pages : 0,
                releasedate: releasedate,
                price: !isNaN(item.price) && item.price !== '' ? item.price : '0',
                currency: item.currency ? item.currency.trim() : '',
                addinfo: item.addinfo,
                comicguideid: item.comicguideid
            }, {transaction: transaction});

            let coverUrl = '';
            if (item.cover)
                coverUrl = await createCoverForIssue(item.cover, item.covers, res, transaction);

            let us = item.series.publisher.us;

            if (us && item.individuals.length > 0) {
                await asyncForEach(item.individuals, async individual => {
                    if (individual.name && individual.name.trim() !== '')
                        await res.associateIndividual(individual.name.trim(), individual.type, transaction);
                });

                await res.save({transaction: transaction});
            }

            if (item.stories) {
                let stories = [];
                await asyncForEach(item.stories, async (story) => {
                    if (story.parent && story.parent.number === 0) {
                        let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);
                        let oStories = await models.Story.findAll({
                            where: {fk_issue: resIssue.id},
                            order: [['number', 'ASC']],
                            transaction
                        });

                        for (let i = 0; i < oStories.length; i++) {
                            stories.push({
                                number: stories.length + 1,
                                parent: {number: i + 1, issue: story.parent.issue},
                                translators: story.translators,
                                addinfo: '',
                                part: '',
                                exclusive: false
                            });
                        }
                    } else {
                        story.number = stories.length + 1;
                        stories.push(story);
                    }
                });

                await asyncForEach(stories, async (story) => await createStory(story, res, transaction, us));
            }

            if (item.features && !us)
                await asyncForEach(item.features, async feature => await createFeature(feature, res, transaction));

            if (item.covers)
                await asyncForEach(item.covers, async cover => await createCover(cover, res, coverUrl, transaction, us));

            resolve(res);
        } catch (e) {
            reject(e);
        }
    });
}

export function findOrCrawlIssue(i, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            let series = await models.Series.findOne({
                where: {
                    title: i.series.title.trim(),
                    volume: i.series.volume,
                    '$Publisher.original$': 1
                },
                include: [models.Publisher],
                transaction
            });

            let issueCreated = false;
            let issue = await models.Issue.findOne({
                where: {
                    number: i.number.trim(),
                    '$Series.title$': i.series.title.trim(),
                    '$Series.volume$': i.series.volume,
                    '$Series->Publisher.original$': 1,
                },
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ],
                transaction
            });

            if (!series) {
                await crawlSeries(i);

                let [publisher] = await models.Publisher.findOrCreate({
                    where: {
                        name: i.series.publisher.name
                    },
                    defaults: {
                        name: i.series.publisher.name,
                        addinfo: '',
                        original: 1,
                    },
                    transaction: transaction
                });

                series = await models.Series.create({
                    title: i.series.title,
                    volume: i.series.volume,
                    startyear: !isNaN(i.series.startyear) ? i.series.startyear : 0,
                    endyear: !isNaN(i.series.endyear) ? i.series.endyear : 0,
                    addinfo: '',
                    fk_publisher: publisher.id
                }, {transaction: transaction});
            }

            let crawledIssue;

            if (!issue) {
                crawledIssue = await crawlIssue(i.number, i.series.title, i.series.volume);
                issue = await models.Issue.create({
                    title: '',
                    number: i.number,
                    format: 'Heft',
                    fk_series: series.id,
                    releasedate: crawledIssue.releasedate,
                    limitation: 0,
                    pages: 0,
                    price: 0,
                    currency: 'USD',
                    addinfo: ''
                }, {transaction: transaction});

                await asyncForEach(crawledIssue.individuals, async (individual) => {
                    await issue.associateIndividual(individual.name.trim(), individual.type, transaction);
                    await issue.save({transaction: transaction});
                });

                await asyncForEach(crawledIssue.arcs, async (arc) => {
                    await createArc(arc, issue, transaction);
                });

                issueCreated = true;
            }

            if (issueCreated) {
                let newCover = await models.Cover.create({
                    url: crawledIssue.cover.url,
                    number: 0,
                    addinfo: ''
                }, {transaction: transaction});

                await asyncForEach(crawledIssue.cover.individuals, async (artist) => {
                    await newCover.associateIndividual(artist.name.trim(), 'ARTIST', transaction);
                    await newCover.save({transaction: transaction});
                });
                await newCover.setIssue(issue, {transaction: transaction});
                await newCover.save({transaction: transaction});

                await Promise.all(crawledIssue.variants.map(async (crawledVariant) => {
                    let variant = await models.Issue.create({
                        title: '',
                        number: i.number,
                        format: 'Heft',
                        variant: crawledVariant.variant,
                        fk_series: series.id,
                        releasedate: crawledIssue.releasedate,
                        limitation: 0,
                        pages: 0,
                        price: 0,
                        currency: crawledIssue.currency ? crawledIssue.currency : 'USD',
                        addinfo: ''
                    }, {transaction: transaction});

                    await asyncForEach(crawledIssue.individuals, async (individual) => {
                        await variant.associateIndividual(individual.name.trim(), individual.type, transaction);
                    });
                    await variant.save({transaction: transaction});

                    let newCover = await models.Cover.create({
                        url: crawledVariant.cover.url,
                        number: 0,
                        addinfo: ''
                    }, {transaction: transaction});

                    await newCover.setIssue(variant, {transaction: transaction});
                    await newCover.save({transaction: transaction});

                    return variant;
                }));

                await Promise.all(crawledIssue.stories.map(async (crawledStory) => {
                    let reprintId;

                    if (crawledStory.reprintOf) {
                        let reprintIssue = await findOrCrawlIssue(crawledStory.reprintOf.issue, transaction);
                        let reprintStory = await models.Story.findOne({
                            where: {fk_issue: reprintIssue.dataValues.id, number: crawledStory.reprintOf.number},
                            transaction
                        });

                        reprintId = reprintStory.id;
                    }

                    let newStory = await models.Story.create({
                        title: crawledStory.title ? crawledStory.title : '',
                        number: !isNaN(crawledStory.number) ? crawledStory.number : 1,
                        addinfo: '',
                        part: '',
                        fk_reprint: reprintId
                    }, {transaction: transaction});

                    await asyncForEach(crawledStory.individuals, async (individual) => {
                        await newStory.associateIndividual(individual.name.trim(), individual.type, transaction);
                    });

                    await asyncForEach(crawledStory.appearances, async appearance => {
                        await newStory.associateAppearance(appearance.name.trim(), appearance.type, appearance.role, transaction);
                    });

                    await newStory.setIssue(issue, {transaction: transaction});
                    await newStory.save({transaction: transaction});

                    return newStory;
                }));
            }

            resolve(issue);
        } catch (e) {
            reject(e);
        }
    })
}

async function createCoverForIssue(cover, covers, issue, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            const {createReadStream, filename} = await cover;
            const stream = createReadStream();
            const {hash} = await storeFile({stream, filename});

            let coverUrl = '/' + coverDir + '/' + hash;

            let isCoverInArray;
            if (covers)
                covers.forEach(e => {
                    if (e.number === 0)
                        isCoverInArray = true;
                });

            if (!isCoverInArray) {
                let res = await models.Cover.create({
                    url: coverUrl,
                    number: 0,
                    addinfo: ''
                }, {transaction: transaction});

                res.setIssue(issue, {transaction: transaction});
                await res.save({transaction: transaction});
            } //else it's handled during array iteration

            resolve(coverUrl);
        } catch (e) {
            reject(e);
        }
    });
}
