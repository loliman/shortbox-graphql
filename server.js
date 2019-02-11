const {ApolloServer, gql} = require('apollo-server-express');
import express from 'express';
import fs from 'fs';
import https from 'https';
import {GraphQLScalarType} from 'graphql';
import models from './models';
import {createContext, EXPECTED_OPTIONS_KEY} from 'dataloader-sequelize';
import {resolver} from 'graphql-sequelize';

var dateFormat = require('dateformat');

var reA = /[^a-zA-Z]/g;
var reN = /[^0-9]/g;

const typeDefs = gql`
  scalar Date

  type Query {
    publishers(us: Boolean!): [Publisher],
    series(publisher: PublisherInput!): [Series],
    issues(series: SeriesInput!): [Issue],
    
    publisher(publisher: PublisherInput!): Publisher,
    seriesd(series: SeriesInput!): Series,
    issue(issue: IssueInput!): Issue
  }
  
  type Mutation {
    login(user: UserInput!): User,
    logout(user: UserInput!): Boolean,
    
    deletePublishers(item: PublisherInput!): Boolean,
    deleteSeries(item: SeriesInput!): Boolean,
    deleteIssues(item: IssueInput!): Boolean,
    
    createPublisher(publisher: PublisherInput!): Publisher,
    createSeries(series: SeriesInput!): Series,
    
    editPublisher(old: PublisherInput!, edit: PublisherInput!): Publisher,
    editSeries(old: SeriesInput!, edit: SeriesInput!): Series
  }
  
  input PublisherInput {
    id: String,
    name: String,
    us: Boolean
  }
  
  type Publisher {
    id: ID,
    name: String,
    series: [Series],
    us: Boolean
  }
  
  input SeriesInput {
    id: String,
    title: String,
    startyear: Int,
    endyear: Int,
    volume: Int,
    publisher: PublisherInput
  }
  
  type Series {
    id: ID,
    title: String,
    startyear: Int,
    endyear: Int,
    volume: Int,
    publisher: Publisher
  }
  
  input IndividualInput {
    name: String
  }
  
  type Individual {
    id: ID,
    name: String
  }
  
  input FeatureInput {
    title: String,
    number: Int,
    addinfo: String
  }
  
  type Feature {
    id: ID,
    title: String,
    number: Int,
    addinfo: String,
    issue: Issue,
    writers: [Individual],
    translators: [Individual]
  }
  
  input StoryInput {
    title: String,
    number: Int,
    addinfo: String
  }
  
  type Story {
    id: ID,
    title: String,
    number: Int,
    addinfo: String,
    issue: Issue,
    parent: Story,
    children: [Story],
    firstapp: Boolean,
    pencilers: [Individual],
    writers: [Individual],
    inkers: [Individual],
    colourists: [Individual],
    letterers: [Individual],
    editors: [Individual],
    translators: [Individual]    
  }
  
  input CoverInput {
    url: String,
    number: Int,
    addinfo: String
  }
  
  type Cover {
    id: ID,
    url: String,
    number: Int,
    addinfo: String,
    parent: Cover,
    children: [Cover],
    firstapp: Boolean,
    issue: Variant,
    artists: [Individual]
  }
  
  interface IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    cover: Cover,
    price: String,
    currency: String,
    releasedate: Date,
    verified: Boolean
  }
  
  input IssueInput {
    format: String,
    limitation: Int,
    cover: CoverInput,
    variant: String,
    price: String,
    currency: String,
    title: String,
    number: String,
    series: SeriesInput,
    language: String,
    pages: Int,
    releasedate: Date
  }
  
  type Issue implements IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    cover: Cover,
    price: String,
    currency: String,
    title: String,
    number: String,
    series: Series,
    language: String,
    pages: Int,
    releasedate: Date,
    features: [Feature],
    stories: [Story],
    covers: [Cover],
    variants: [Variant],
    verified: Boolean,
    editors: [Individual]
  }
  
  type Variant implements IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    cover: Cover,
    price: String,
    currency: String,
    issue: Issue,
    variant: String,
    releasedate: Date,
    verified: Boolean
  }
  
  input UserInput {
    id: Int,
    name: String,
    password: String,
    sessionid: String
  }
  
  type User {
    id: ID,
    sessionid: String
  }
`;

const resolvers = {
    Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
            return new Date(value);
        },
        serialize(value) {
            if (value.indexOf('-00') !== -1)
                value = '1900-01-01';

            return dateFormat(new Date(value), "dd.mm.yyyy");
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.INT) {
                return parseInt(ast.value, 10);
            }
            return null;
        },
    }),
    Query: {
        publishers: (_, {us}) => models.Publisher.findAll({
            where: {original: (us ? 1 : 0)},
            order: [['name', 'ASC']]
        }),
        series: (_, {publisher}) => models.Series.findAll({
            where: {'$Publisher.name$': publisher.name},
            order: [['title', 'ASC'], ['volume', 'ASC']],
            include: [models.Publisher]
        }),
        issues: async (_, {series}) => {
            let res = await models.Issue.findAll({
                where: {
                    '$Series.title$': series.title,
                    '$Series.volume$': series.volume,
                    '$Series->Publisher.name$': series.publisher.name
                },
                order: [['number', 'ASC']],
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });

            return res.sort((a, b) => {
                var aA = a.number.replace(reA, "");
                var bA = b.number.replace(reA, "");
                if (aA === bA) {
                    var aN = parseInt(a.number.replace(reN, ""), 10);
                    var bN = parseInt(b.number.replace(reN, ""), 10);
                    return aN === bN ? 0 : aN > bN ? 1 : -1;
                } else {
                    return aA > bA ? 1 : -1;
                }
            })
        },
        publisher: (_, {publisher}) =>
            models.Publisher.findOne({
                where: {
                    name: publisher.name
                }
            }),
        seriesd: (_, {series}) =>
            models.Series.findOne({
                where: {title: series.title, volume: series.volume, '$Publisher.name$': series.publisher.name},
                include: [models.Publisher]
            }),
        issue: (_, {issue}) =>
            models.Issue.findOne({
                where: {
                    number: issue.number,
                    '$Series.title$': issue.series.title,
                    '$Series.volume$': issue.series.volume,
                    '$Series->Publisher.name$': issue.series.publisher.name
                },
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            })
    },
    Mutation: {
        login: async (_, {user}) => {
            var sessionid = "";
            var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?%.,;:-_&$(){}[]";

            for (var i = 0; i < 255; i++)
                sessionid += possible.charAt(Math.floor(Math.random() * possible.length));

            let res = await models.User.update(
                {sessionid: sessionid},
                {where: {name: user.name.trim(), password: user.password}}
            );

            if (res[0] === 0)
                throw new Error();

            return {id: res[0], sessionid: sessionid};
        },
        logout: async (_, {user}) => {
            let res = await models.User.update(
                {sessionid: null},
                {where: {id: user.id, sessionid: user.sessionid}}
            );

            return res[0] !== 0;
        },
        deletePublishers: async (_, {item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let del = await models.Publisher.destroy({
                where: {name: item.name.trim()}
            });

            return del === 1;
        },
        deleteSeries: async (_, {item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let pub = await models.Publisher.findOne({
                where: {
                    name: item.publisher.name.trim()
                }
            });

            let del = await models.Series.destroy({
                where: {title: item.title.trim(), volume: item.volume, fk_publisher: pub.id},
                include: [models.Publisher]
            });

            return del === 1;
        },
        deleteIssues: async (_, {item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            return true;
            /*            let del = await models.Series.destroy({
                where: {'$Series.title$': series_title, '$Series.volume$': series_volume, '$Series->Publisher.name$': publisher_name},
                order: [['number', 'ASC']],
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });
            return del === 1;*/
        },
        createPublisher: async (_, {publisher}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.create({
                name: publisher.name.trim(),
                original: false
            });

            if (res)
                return res.dataValues;
        },
        createSeries: async (_, {series}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let pub = await models.Publisher.findOne({
                where: {
                    name: series.publisher.name.trim()
                }
            });

            let res = await models.Series.create({
                title: series.title.trim(),
                volume: series.volume,
                startyear: series.startyear,
                endyear: series.endyear,
                fk_publisher: pub.id
            });

            if(res)
                return res.dataValues;
        },
        editPublisher: async (_, {old, edit}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.findOne({
                where: {
                    name: old.name.trim()
                }
            });

            res.name = edit.name.trim();
            res = await res.save();

            return res.dataValues;
        },
        editSeries: async (_, {old, edit}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let newPub = await models.Publisher.findOne({
                where: {
                    name: edit.publisher.name.trim()
                }
            });

            let res = await models.Series.findOne({
                where: {title: old.title.trim(), volume: old.volume, '$Publisher.name$': old.publisher.name},
                include: [models.Publisher]
            });

            res.title = edit.title.trim();
            res.volume = edit.volume;
            res.startyear = edit.startyear;
            res.endyear = edit.endyear;
            res.setPublisher(newPub);
            res = await res.save();

            return res.dataValues;
        }
    },
    Publisher: {
        id: (parent) => parent.id,
        name: (parent) => parent.name,
        us: (parent) => parent.original
    },
    Series: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        startyear: (parent) => parent.startyear,
        endyear: (parent) => parent.endyear,
        volume: (parent) => parent.volume,
        publisher: (parent) => models.Publisher.findById(parent.fk_publisher)
    },
    Individual: {
        id: (parent) => parent.id,
        name: (parent) => parent.name
    },
    Feature: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        addinfo: (parent) => parent.addinfo,
        issue: (parent) => models.Issue.findById(parent.fk_issue),
        writers: (parent) => models.Individual.findAll({
            include: [{
                model: models.Feature
            }],
            where: {
                '$Features->Feature_Individual.fk_feature$': parent.id,
                '$Features->Feature_Individual.type$': 'WRITER'
            }
        }),
        translators: (parent) => models.Individual.findAll({
            include: [{
                model: models.Feature
            }],
            where: {
                '$Features->Feature_Individual.fk_feature$': parent.id,
                '$Features->Feature_Individual.type$': 'TRANSLATOR'
            }
        })
    },
    Story: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        addinfo: (parent) => parent.addinfo,
        issue: (parent) => models.Issue.findById(parent.fk_issue),
        parent: (parent) => models.Story.findById(parent.fk_parent),
        children: (parent) => models.Story.findAll({
            where: {fk_parent: parent.id},
            include: [models.Issue],
            order: [[models.Issue, 'releasedate', 'ASC']]
        }),
        firstapp: async (parent) => await models.Issue.count({
            where: {'$Stories.fk_issue$': parent.fk_parent},
            include: [{model: models.Story, as: 'Stories'}],
            order: [['releasedate', 'ASC']]
        }) === 1,
        pencilers: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'PENCILER'
            }
        }),
        writers: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'WRITER'
            }
        }),
        inkers: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'INKER'
            }
        }),
        colourists: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'COLOURIST'
            }
        }),
        letterers: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'LETTERER'
            }
        }),
        editors: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'EDITOR'
            }
        }),
        translators: (parent) => models.Individual.findAll({
            include: [{
                model: models.Story
            }],
            where: {
                '$Stories->Story_Individual.fk_story$': parent.id,
                '$Stories->Story_Individual.type$': 'TRANSLATOR'
            }
        })
    },
    Cover: {
        id: (parent) => parent.id,
        url: (parent) => parent.url,
        number: (parent) => parent.number,
        parent: (parent) => models.Cover.findById(parent.fk_parent),
        issue: (parent) => models.Issue.findById(parent.fk_issue),
        children: (parent) => models.Cover.findAll({
            where: {fk_parent: parent.id},
            include: [models.Issue],
            order: [[models.Issue, 'releasedate', 'ASC']]
        }),
        firstapp: async (parent) => await models.Issue.count({
            where: {'$Covers.fk_issue$': parent.fk_parent},
            include: [{model: models.Cover, as: 'Covers'}],
            order: [['releasedate', 'ASC']]
        }) === 1,
        addinfo: (parent) => parent.addinfo,
        artists: (parent) => models.Individual.findAll({
            include: [{
                model: models.Cover
            }],
            where: {
                '$Covers->Cover_Individual.fk_cover$': parent.id,
                '$Covers->Cover_Individual.type$': 'ARTIST'
            }
        })
    },
    IssueBase: {
        __resolveType(issue, context, info) {
            return issue.variants ? 'Issue' : 'Variant';
        }
    },
    Issue: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        format: (parent) => parent.format,
        series: (parent) => models.Series.findById(parent.fk_series),
        variants: (parent) => models.Issue.findAll({where: {fk_variant: parent.id}}),
        features: (parent) => models.Feature.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]}),
        stories: (parent) => models.Story.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]}),
        covers: (parent) => models.Cover.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]}),
        limitation: (parent) => parent.limitation,
        cover: (parent) => models.Cover.findOne({where: {fk_issue: parent.id, number: 0}}),
        price: (parent) => parent.price.toFixed(2).toString().replace(".", ","),
        currency: (parent) => parent.currency,
        language: (parent) => parent.language,
        pages: (parent) => parent.pages,
        releasedate: (parent) => parent.releasedate,
        verified: (parent) => parent.verified,
        editors: (parent) => models.Individual.findAll({
            include: [{
                model: models.Issue
            }],
            where: {
                '$Issues->Issue_Individual.fk_issue$': parent.id,
                '$Issues->Issue_Individual.type$': 'EDITOR'
            }
        })
    },
    Variant: {
        id: (parent) => parent.id,
        format: (parent) => parent.format,
        limitation: (parent) => parent.limitation,
        cover: (parent) => models.Cover.findOne({where: {fk_issue: parent.id, number: 0}}),
        issue: (parent) => {
            if(parent.fk_variant !== null)
                return models.Issue.findOne({where: {id: parent.fk_variant}});
            else
                return models.Issue.findOne({where: {id: parent.id}});
        },
        price: (parent) => parent.price.toFixed(2).toString().replace(".", ","),
        currency: (parent) => parent.currency,
        releasedate: (parent) => parent.releasedate,
        verified: (parent) => parent.verified
    },
    User: {
        id: (parent) => parent.id,
        sessionid: (parent) => parent.sessionid
    }
};

resolver.contextToOptions = {dataloader: EXPECTED_OPTIONS_KEY};

const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({req}) => {
        let userid = req.headers.authorization.split(/:(.+)/)[0];
        let sessionid = req.headers.authorization.split(/:(.+)/)[1];

        let loggedIn = false;
        let user = await models.User.count({where: {id: userid, sessionid: sessionid}});
        if (user === 1)
            loggedIn = true;

        const dataloader = createContext(models.sequelize);
        return {loggedIn, dataloader};
    }
});

const app = express();
apollo.applyMiddleware({app});

const server = https.createServer(
    {
        key: fs.readFileSync(`../localhost+2-key.pem`),
        cert: fs.readFileSync(`../localhost+2.pem`)
    },
    app
);

apollo.installSubscriptionHandlers(server);

export default server;