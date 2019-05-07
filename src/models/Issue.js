import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach, deleteFile, naturalCompare, storeFile} from "../util/util";
import {crawlIssue, crawlSeries} from "../core/crawler";
import {coverDir} from "../config/config";
import {create as createStory, equals as storyEquals, getStories} from "./Story";
import {create as createCover, equals as coverEquals, getCovers} from "./Cover";
import {create as createFeature, equals as featureEquals, getFeatures} from "./Feature";

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
                    resolve(await models.Issue_Individual.create({fk_issue: this.id, fk_individual: individual.id, type: type}, {transaction: transaction}));
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let cover = await models.Cover.findOne({where: {fk_issue: this.id, number: 0}, transaction});
                if(cover)
                    if(!cover.url.indexOf('http') === 0)
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
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['number', 'fk_series', 'format', 'variant']
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
    verifyIssue(item: IssueInput!): Issue
  }
  
  extend type Query {
    issues(series: SeriesInput!): [Issue], 
    lastEdited(us: Boolean): [Issue],
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
    editors: [IndividualInput],
    addinfo: String,
    stories: [StoryInput],
    features: [FeatureInput],
    covers: [CoverInput]
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
    features: [Feature],
    stories: [Story],
    covers: [Cover],
    variants: [Issue],
    variant: String,
    verified: Boolean,
    addinfo: String,
    editors: [Individual],
    createdAt: DateTime,
    updatedAt: DateTime
  }
`;

export const resolvers = {
    Query: {
        issues: async (_, {series}) => {
            let res = await models.Issue.findAll({
                attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.title')), 'title'],
                    [models.sequelize.fn('MIN', models.sequelize.col('format')), 'format'],
                    [models.sequelize.fn('MIN', models.sequelize.col('variant')), 'variant'],
                    'number', 'fk_series'],
                where: {
                    '$Series.title$': series.title,
                    '$Series.volume$': series.volume,
                    '$Series->Publisher.name$': series.publisher.name
                },
                order: [['number', 'ASC'], ['variant', 'DESC'], ['title', 'DESC'], ['format', 'DESC']],
                group: ['fk_series', 'number'],
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });

            return res.sort((a, b) => naturalCompare(a.number, b.number));
        },
        lastEdited: async (_, {us}) => await models.Issue.findAll({
            where: {
                '$Series->Publisher.original$': us
            },
            include: [
                {
                    model: models.Series,
                    include: [
                        models.Publisher
                    ]
                }
            ],
            order: [['updatedAt', 'DESC']],
            limit: 50
        }),
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

            if(res)
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
                    where: {title: item.series.title.trim(), volume: item.series.volume, '$Publisher.name$': item.series.publisher.name.trim()},
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
                return del === 1;
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

                if(oldPub.original !== newPub.original)
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
                if(parseInt(releasedate.toLocaleString().substring(0, 4)) < newSeries.startyear)
                    releasedate.setFullYear(newSeries.startyear);

                res.title = item.title ? item.title.trim() : '';
                res.number = item.number.trim();
                res.setSeries(newSeries, {transaction: transaction});
                res.format = item.format ? item.format.trim() : '';
                res.variant = item.variant ? item.variant.trim() : '';
                res.limitation = item.limitation;
                res.pages = item.pages;
                res.releasedate = releasedate;
                res.price = !isNaN(item.price) && item.price !== '' ? item.price : '0';
                res.currency = item.currency ? item.currency.trim() : '';
                res.addinfo = item.addinfo;

                res = await res.save({transaction: transaction});

                let cover = await models.Cover.findOne({where: {fk_issue: res.id, number: 0}, transaction});

                let coverUrl = '';

                if(item.cover === '') { //Cover has been deleted
                    if (cover) {
                        if(!cover.url.indexOf('http') === 0)
                            deleteFile(cover.url);
                        await cover.destroy({transaction});
                    }
                } else if(item.cover instanceof Promise) { //Cover has been changed
                    if(cover) {
                        if(!cover.url.indexOf('http') === 0)
                            deleteFile(cover.url);
                        await cover.destroy({transaction});
                    }

                    coverUrl = await createCoverForIssue(item.cover, item.covers, res, transaction);
                } // else nothing has changed

                let us = item.series.publisher.us;

                if (us && item.editors.length > 0) {
                    await models.Issue_Individual.destroy({where: {fk_issue: res.id, type: 'EDITOR'}, transaction});

                    await asyncForEach(item.editors, async editor => {
                        if(editor.name && editor.name.trim() !== '')
                            await res.associateIndividual(editor.name.trim(), 'EDITOR', transaction);
                    });

                    await res.save({transaction: transaction});
                }

                let oldStories = await getStories(res, transaction);

                let deletedStories = oldStories.filter(o => {
                    let found = false;
                    item.stories.forEach(n => {
                        if(!found)
                            found = storyEquals(o, n);
                    });
                    return !found;
                });

                if(us)
                    deletedStories.forEach(deletedStory => {
                        if(!deletedStory.exclusive)
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
                        if(!found)
                            found = storyEquals(n, o);
                    });
                    return !found;
                });

                if (item.stories) {
                    let stories = [];
                    await asyncForEach(newStories, async (story) => {
                        if(story.parent && story.parent.number === 0) {
                            let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);
                            let oStories = await models.Story.findAll({where: {fk_issue: resIssue.id}, order: [['number', 'ASC']], transaction});

                            for(let i = 0; i < oStories.length; i++) {
                                stories.push({
                                    number: stories.length+1,
                                    parent: {number: i+1, issue: story.parent.issue},
                                    translators: story.translators,
                                    addinfo: '',
                                    exclusive: false
                                });
                            }
                        } else {
                            stories.push(story);
                        }
                    });

                    await asyncForEach(stories, async (story) => await createStory(story, res, transaction, us));
                }

                if(!us) {
                    let oldFeatures = await getFeatures(res, transaction);

                    let deletedFeatures = oldFeatures.filter(o => {
                        let found = false;
                        item.features.forEach(n => {
                            if(!found)
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
                            if(!found)
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
                        if(!found)
                            found = coverEquals(o, n);
                    });

                    if(o.number === 0 && coverUrl !== '')
                        found = true;

                    return !found;
                });

                if(us)
                    deletedCovers.forEach(deletedCover => {
                        if(!deletedCover.exclusive)
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
                        if(!found)
                            found = coverEquals(n, o);
                    });

                    if(n.number === 0 && coverUrl !== '')
                        found = false;

                    return !found;
                });

                let url;
                newCovers.forEach(cover => {
                    if(cover.number === 0)
                        url = '';
                });

                if(url === '') {
                    deletedCovers.forEach(cover => {
                        if (cover.number === 0)
                            url = cover.url;
                    });
                }

                await asyncForEach(newCovers, async cover => {
                    if(url && url !== '' && cover.number === 0)
                        coverUrl = url;

                    await createCover(cover, res, coverUrl, transaction, us);
                });

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

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },
    Issue: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        format: (parent) => parent.format,
        series: async (parent) => models.Series.findById(parent.fk_series),
        variants: async (parent) => {
            return await models.Issue.findAll({
                where: {fk_series: parent.fk_series, number: parent.number},
                order: [['variant', 'ASC'], ['title', 'ASC'], ['format', 'ASC'], ['releasedate', 'ASC']]
            })
        },
        variant: (parent) => parent.variant,
        features: async (parent) => {
            if((await (await parent.getSeries()).getPublisher()).original)
                return [];

            let features = await models.Feature.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]});

            if(features.length === 0 && !parent.edit) {
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

            if(stories.length === 0 && !parent.edit) {
                let issues = await models.Issue.findAll({
                    where: {fk_series: parent.fk_series, number: parent.number},
                    order: [['createdAt', 'ASC']]
                });

                await asyncForEach(issues, async issue => {
                    let issueStories = await models.Story.findAll({where: {fk_issue: issue.id}, order: [['number', 'ASC']]});

                    if(issueStories.length > 0 && stories.length === 0)
                        stories = issueStories;
                });
            }

            return stories;
        },
        covers: async (parent) => {
            let covers = await models.Cover.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]});

            let issues = await models.Issue.findAll({
                where: {fk_series: parent.fk_series, number: parent.number},
                order: [['createdAt', 'ASC']]
            });

            await asyncForEach(issues, async issue => {
                let issueCovers = await models.Cover.findAll({where: {fk_issue: issue.id}, order: [['number', 'ASC']]});

                if(issueCovers.length > 0 && covers.length === 0)
                    covers = issueStories;
            });

            return covers;
        },
        limitation: (parent) => parent.limitation,
        cover: async (parent) => await models.Cover.findOne({where: {fk_issue: parent.id, number: 0}}),
        price: (parent) => (typeof parent.price === 'string') ? parent.price : parent.price.toFixed(2).toString(),
        currency: (parent) => parent.currency,
        pages: (parent) => parent.pages,
        releasedate: (parent) => parent.releasedate,
        verified: (parent) => parent.verified,
        addinfo: (parent) => parent.addinfo,
        editors: async (parent) => {
            if(!(await (await parent.getSeries()).getPublisher()).original)
                return [];

            return await models.Individual.findAll({
                include: [{
                    model: models.Issue
                }],
                where: {
                    '$Issues->Issue_Individual.fk_issue$': parent.id,
                    '$Issues->Issue_Individual.type$': 'EDITOR'
                }
            })
        },
        createdAt: (parent) => parent.createdAt,
        updatedAt: (parent) => parent.updatedAt
    }
};

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
            if(parseInt(releasedate.toLocaleString().substring(0, 4)) < series.startyear)
                releasedate.setFullYear(series.startyear);

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
                addinfo: item.addinfo
            }, {transaction: transaction});

            let coverUrl = '';
            if (item.cover)
                coverUrl = await createCoverForIssue(item.cover, item.covers, res, transaction);

            let us = item.series.publisher.us;

            if (us && item.editors.length > 0) {
                await asyncForEach(item.editors, async editor => {
                    if (editor.name && editor.name.trim() !== '')
                        await res.associateIndividual(editor.name.trim(), 'EDITOR', transaction);
                });

                await res.save({transaction: transaction});
            }

            if (item.stories) {
                let stories = [];
                await asyncForEach(item.stories, async (story) => {
                    if(story.parent && story.parent.number === 0) {
                        let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);
                        let oStories = await models.Story.findAll({where: {fk_issue: resIssue.id}, order: [['number', 'ASC']], transaction});

                        for(let i = 0; i < oStories.length; i++) {
                            stories.push({
                                number: stories.length+1,
                                parent: {number: i+1, issue: story.parent.issue},
                                translators: story.translators,
                                addinfo: '',
                                exclusive: false
                            });
                        }
                    } else {
                        story.number = stories.length+1;
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

            if(!series) {
                let crawledSeries = await crawlSeries(i.series);

                let [publisher] = await models.Publisher.findOrCreate({
                    where: {
                        name: crawledSeries.publisher.name
                    },
                    defaults: {
                        name: crawledSeries.publisher.name,
                        addinfo: '',
                        original: 1,
                    },
                    transaction: transaction
                });

                series = await models.Series.create({
                    title: crawledSeries.title,
                    volume: crawledSeries.volume,
                    startyear: !isNaN(crawledSeries.startyear) ? crawledSeries.startyear : 0,
                    endyear: !isNaN(crawledSeries.endyear) ? crawledSeries.endyear : 0,
                    addinfo: '',
                    fk_publisher: publisher.id
                }, {transaction: transaction});
            }

            let crawledIssue;

            if(!issue) {
                crawledIssue = await crawlIssue(i);
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

                await asyncForEach(crawledIssue.editors, async (editor) => {
                    await issue.associateIndividual(editor.name.trim(), 'EDITOR', transaction);
                    await issue.save({transaction: transaction});
                });

                issueCreated = true;
            }

            if (issueCreated) {
                let newCover = await models.Cover.create({
                    url: crawledIssue.cover.url,
                    number: 0,
                    addinfo: ''
                }, {transaction: transaction});

                await asyncForEach(crawledIssue.cover.artists, async (artist) => {
                    await newCover.associateIndividual(artist.name.trim(), 'ARTIST', transaction);
                    await newCover.save({transaction: transaction});
                });
                await newCover.setIssue(issue, {transaction: transaction});
                await newCover.save({transaction: transaction});

                await Promise.all(crawledIssue.variants.map(async (crawledVariant) => {
                    let variant = await models.Issue.create({title: '',
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

                    await asyncForEach(crawledIssue.editors, async (editor) => {
                        await variant.associateIndividual(editor.name.trim(), 'EDITOR', transaction);
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
                    let newStory = await models.Story.create({
                        title: crawledStory.title ? crawledStory.title : '',
                        number: !isNaN(crawledStory.number) ? crawledStory.number : 1,
                        addinfo: ''
                    }, {transaction: transaction});

                    await asyncForEach(crawledStory.individuals, async (individual) => {
                        await newStory.associateIndividual(individual.name.trim(), individual.type, transaction);
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
            if(covers)
                covers.forEach(e => {
                    if(e.number === 0)
                        isCoverInArray = true;
                });

            if(!isCoverInArray) {
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