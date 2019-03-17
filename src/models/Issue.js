import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach, deleteFile, storeFile} from "../util/util";
import {crawlIssue, crawlSeries} from "../core/crawler";
import {coverDir} from "../config/config";
import {create as createStory} from "./Story";
import {create as createCover} from "./Cover";
import {create as createFeature} from "./Feature";

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

    async associateIndividual(name, type) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Individual.findOrCreate({
                    where: {
                        name: name
                    }
                }).then(async ([individual, created]) => {
                    resolve(await models.Issue_Individual.create({fk_issue: this.id, fk_individual: individual.id, type: type}));
                });
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
            type: Sequelize.INTEGER,
            allowNull: false
        },
        format: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        limitation: {
            type: Sequelize.INTEGER,
            allowNull: true
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
            allowNull: true
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
    lastEdited: [Issue],
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
                where: {
                    '$Series.title$': series.title,
                    '$Series.volume$': series.volume,
                    '$Series->Publisher.name$': series.publisher.name
                },
                order: [['number', 'ASC']],
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

            let reA = /[^a-zA-Z]/g;
            let reN = /[^0-9]/g;
            return res.sort((a, b) => {
                var aA = toString(a.number).replace(reA, "");
                var bA = toString(b.number).replace(reA, "");
                if (aA === bA) {
                    var aN = parseInt(toString(a.number).replace(reN, ""), 10);
                    var bN = parseInt(toString(b.number).replace(reN, ""), 10);
                    return aN === bN ? 0 : aN > bN ? 1 : -1;
                } else {
                    return aA > bA ? 1 : -1;
                }
            })
        },
        lastEdited: async () => await models.Issue.findAll({
            where: {
                '$Series->Publisher.original$': false
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
            limit: 25
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

            res.edit = (edit === true);
            return res;
        }
    },
    Mutation: {
        deleteIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error();

                let series = await models.Series.findOne({
                    where: {title: item.series.title, volume: item.series.volume, '$Publisher.name$': item.series.publisher.name},
                    include: [models.Publisher]
                });

                let where = {
                    number: item.number,
                    format: item.format,
                    variant: item.variant,
                    fk_series: series.id
                };

                if (item.format)
                    where.format = item.format;

                if (item.variant)
                    where.variant = item.variant;

                let issue = await models.Issue.findOne({
                    where: where
                });

                let cover = await models.Cover.findOne({where: {fk_issue: issue.id, number: 0}});
                if(cover)
                    deleteFile(cover.url);

                await models.Story.destroy({where: {fk_issue: issue.id}});
                await models.Feature.destroy({where: {fk_issue: issue.id}});
                await models.Cover.destroy({where: {fk_issue: issue.id}});

                let del = await models.Issue.destroy({
                    where: {id: issue.id}
                });

                transaction.commit();
                return del === 1;
            } catch (e) {
                transaction.rollback();
                throw e;
            }
        },
        createIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error();

                let series = await models.Series.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$Publisher.name$': item.series.publisher.name.trim()
                    },
                    include: [models.Publisher]
                });

                let res = await models.Issue.create({
                    title: item.title.trim(),
                    fk_series: series.id,
                    number: item.number.trim(),
                    format: item.format.trim(),
                    variant: item.variant.trim(),
                    limitation: item.limitation,
                    pages: item.pages,
                    releasedate: item.releasedate,
                    price: item.price && item.price.trim() !== '' ? item.price : 0,
                    currency: item.currency,
                    addinfo: item.addinfo
                });

                let coverUrl = '';
                if (item.cover)
                    coverUrl = await createCoverForIssue(item.cover, item.covers, res);

                if (item.stories)
                    await asyncForEach(item.stories, async (story) => createStory(story, res));

                if (item.features)
                    await asyncForEach(item.features, async feature => createFeature(feature, res));

                if (item.covers)
                    await asyncForEach(item.covers, async cover => createCover(cover, res, coverUrl));

                transaction.commit();
                return res;
            } catch (e) {
                transaction.rollback();
                throw e;
            }
        },
        editIssue: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error();

                let where = {
                    number: old.number,
                    '$Series.title$': old.series.title,
                    '$Series.volume$': old.series.volume,
                    '$Series->Publisher.name$': old.series.publisher.name
                };

                if (old.format)
                    where.format = old.format;

                if (old.variant)
                    where.variant = old.variant;

                let newSeries = await models.Series.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$Publisher.name$': item.series.publisher.name
                    },
                    include: [models.Publisher]
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
                    ]
                });

                res.title = item.title;
                res.number = item.number;
                res.setSeries(newSeries);
                res.format = item.format;
                res.variant = item.variant;
                res.limitation = item.limitation;
                res.pages = item.pages;
                res.releasedate = item.releasedate;
                res.price = item.price;
                res.currency = item.currency;
                res.addinfo = item.addinfo;
                res = await res.save();

                let cover = await models.Cover.findOne({where: {fk_issue: res.id, number: 0}});
                let coverUrl = '';

                if(item.cover === '') { //Cover has been deleted
                    if (cover) {
                        deleteFile(cover.url);
                        await cover.destroy();
                    }
                } else if(item.cover instanceof Promise) { //Cover has been changed
                    if(cover) {
                        deleteFile(cover.url);
                        await cover.destroy();
                    }

                    coverUrl = await createCoverForIssue(item.cover, item.covers, res);
                } // else nothing has changed

                let deletedStories = old.stories.filter(o => {
                    let found = false;
                    item.stories.forEach(n => {
                        if(JSON.stringify(o) === JSON.stringify(n))
                            found = true;
                    });
                    return !found;
                });

                asyncForEach(deletedStories, async story => {
                    await models.Story.destroy({
                        where: {
                            number: story.number,
                            fk_issue: res.id
                        }
                    })
                });

                let newStories = item.stories.filter(n => {
                    let found = false;
                    old.stories.forEach(o => {
                        if(JSON.stringify(n) === JSON.stringify(o))
                            found = true;
                    });
                    return !found;
                });

                await asyncForEach(newStories, async (story) => create(story, res));

                let deletedFeatures = old.features.filter(o => {
                    let found = false;
                    item.features.forEach(n => {
                        if(JSON.stringify(o) === JSON.stringify(n))
                            found = true;
                    });
                    return !found;
                });

                asyncForEach(deletedFeatures, async (feature) => {
                    await models.Feature.destroy({
                        where: {
                            number: feature.number,
                            fk_issue: res.id
                        }
                    })
                });

                let newFeatures = item.features.filter(n => {
                    let found = false;
                    old.features.forEach(o => {
                        if(JSON.stringify(n) === JSON.stringify(o))
                            found = true;
                    });
                    return !found;
                });

                await asyncForEach(newFeatures, async feature => createFeature(feature, res));

                let deletedCovers = old.covers.filter(o => {
                    let found = false;
                    item.covers.forEach(n => {
                        if(JSON.stringify(o) === JSON.stringify(n))
                            found = true;
                    });
                    return !found;
                });

                asyncForEach(deletedCovers, async cover => {
                    await models.Feature.destroy({
                        where: {
                            number: cover.number,
                            fk_issue: res.id
                        }
                    })
                });

                let newCovers = item.covers.filter(n => {
                    let found = false;
                    old.covers.forEach(o => {
                        if(JSON.stringify(n) === JSON.stringify(o))
                            found = true;
                    });

                    if(n.number === 0 && coverUrl !== '')
                        found = false;

                    return !found;
                });

                await asyncForEach(newCovers, async cover => createCover(cover, res, coverUrl));

                transaction.commit();
                return res;
            } catch (e) {
                transaction.rollback();
                throw e;
            }
        },
        verifyIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error();

                let where = {
                    number: item.number,
                    '$Series.title$': item.series.title,
                    '$Series.volume$': item.series.volume,
                    '$Series->Publisher.name$': item.series.publisher.name
                };

                if (item.format)
                    where.format = item.format;

                if (item.variant)
                    where.variant = item.variant;

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

                res.verified = !res.verified;
                res = await res.save();

                transaction.commit();
                return res;
            } catch (e) {
                transaction.rollback();
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
                order: [['releasedate', 'ASC'], ['createdAt', 'ASC'], ['variant', 'ASC']]
            })
        },
        variant: (parent) => parent.variant,
        features: async (parent) => {
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
                let issue = await models.Issue.findOne({
                    where: {fk_series: parent.fk_series, number: parent.number},
                    order: [['releasedate', 'ASC'], ['createdAt', 'ASC'], ['variant', 'ASC']]
                });

                stories = await models.Story.findAll({where: {fk_issue: issue.id}, order: [['number', 'ASC']]});
            }

            return stories;
        },
        covers: async (parent) => {
            let covers = await models.Cover.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]});

            if(covers.length === 0 && !parent.edit && !(await (await parent.getSeries()).getPublisher()).original) {
                let issue = await models.Issue.findOne({
                    where: {fk_series: parent.fk_series, number: parent.number},
                    order: [['releasedate', 'ASC'], ['createdAt', 'ASC'], ['variant', 'ASC']]
                });

                covers = await models.Cover.findAll({where: {fk_issue: issue.id}, order: [['number', 'ASC']]});
            }

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
        editors: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Issue
            }],
            where: {
                '$Issues->Issue_Individual.fk_issue$': parent.id,
                '$Issues->Issue_Individual.type$': 'EDITOR'
            }
        }),
        createdAt: (parent) => parent.createdAt,
        updatedAt: (parent) => parent.updatedAt
    }
};

function findOrCrawlIssue(i) {
    return new Promise(async (resolve, reject) => {
        try {
            let series = await models.Series.findOne({
                where: {
                    title: i.series.title.trim(),
                    volume: i.series.volume,
                    '$Publisher.original$': 1
                },
                include: [models.Publisher]
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
                ]
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
                        original: true,
                    }
                });

                series = await models.Series.create({
                    title: crawledSeries.title,
                    volume: crawledSeries.volume,
                    startyear: crawledSeries.startyear,
                    endyear: crawledSeries.endyear,
                    addinfo: '',
                    fk_publisher: publisher.id
                });
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
                    price: crawledIssue.price ? crawledIssue.price : 0,
                    currency: crawledIssue.currency ? crawledIssue.currency : 'USD',
                    addinfo: ''
                });

                await issue.associateIndividual(crawledIssue.editor.name.trim(), 'EDITOR');
                await issue.save();

                issueCreated = true;
            }

            if (issueCreated) {
                let newCover = await models.Cover.create({
                    url: crawledIssue.cover.url,
                    number: 0,
                    addinfo: ''
                });

                await newCover.associateIndividual(crawledIssue.cover.artist.name.trim(), 'ARTIST');
                await newCover.setIssue(issue);
                await newCover.save();

                await Promise.all(crawledIssue.variants.map(async (crawledVariant) => {
                    let variant = await models.Issue.create({title: '',
                        number: i.number,
                        format: 'Heft',
                        variant: crawledVariant.variant,
                        fk_series: series.id,
                        releasedate: crawledIssue.releasedate,
                        price: crawledIssue.price ? crawledIssue.price : 0,
                        currency: crawledIssue.currency ? crawledIssue.currency : 'USD',
                        addinfo: ''
                    });

                    await variant.associateIndividual(crawledIssue.editor.name.trim(), 'EDITOR');

                    let newCover = await models.Cover.create({
                        url: crawledVariant.cover.url,
                        number: 0,
                        addinfo: ''
                    });

                    await newCover.setIssue(variant);
                    await newCover.save();

                    return variant;
                }));

                await Promise.all(crawledIssue.stories.map(async (crawledStory) => {
                    let newStory = await models.Story.create({
                        title: crawledStory.title ? crawledStory.title : '',
                        number: crawledStory.number,
                        addinfo: ''
                    });

                    await asyncForEach(crawledStory.individuals, async (individual) => {
                        await newStory.associateIndividual(individual.name.trim(), individual.type);
                    });
                    await newStory.setIssue(issue);
                    await newStory.save();

                    return newStory;
                }));
            }

            resolve(issue);
        } catch (e) {
            reject(e);
        }
    })
}

async function createCoverForIssue(cover, covers, issue) {
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
                });

                res.setIssue(issue);
                await res.save();
            } //else it's handled during array iteration

            resolve(coverUrl);
        } catch (e) {
            reject(e);
        }
    });
}