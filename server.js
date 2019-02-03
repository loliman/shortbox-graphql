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
    series(publisher_name: String!): [Series],
    issues(series_title: String!, series_volume: Int!, publisher_name: String!): [Issue],
    publisher(publisher_name: String!): Publisher,
    seriesd(series_title: String!, series_volume: Int!, publisher_name: String!): Series,
    issue(issue_number: String!, series_title: String!, series_volume: Int!, publisher_name: String!): Issue
  }
  
  type Mutation {
    login(name: String!, password: String!): User,
    logout(id: Int!, sessionid: String!): Boolean,
    
    deletePublishers(publisher_name: String!): Boolean,
    deleteSeries(series_title: String!, series_volume: Int!, publisher_name: String!): Boolean,
    deleteIssues(issue_number: String!, series_title: String!, series_volume: Int!, publisher_name: String!): Boolean,
    
    createPublisher(name: String!): Publisher,
    createSeries(title: String!, startyear: Int!, endyear: Int, volume: Int!, publisher_name: String!): Series,
    
    editPublisher(name_old: String!, name: String!): Publisher,
    editSeries(title_old: String!, volume_old: Int!, publisher_old: String!, title: String!, publisher: String!, volume: Int!, startyear: Int!, endyear: Int): Series
  }
  
  type Publisher {
    id: ID,
    name: String,
    series: [Series],
    us: Boolean
  }
  
  type Series {
    id: ID,
    title: String,
    startyear: Int,
    endyear: Int,
    volume: Int,
    publisher: Publisher
  }
  
  type Story {
    id: ID,
    title: String,
    number: Int,
    addinfo: String,
    issue: Issue,
    parent: Story,
    children: [Story],
    firstapp: Boolean
  }
  
  interface IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    coverurl: String,
    price: String,
    currency: String,
    releasedate: Date,
    verified: Boolean
  }
  
  type Issue implements IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    coverurl: String,
    price: String,
    currency: String,
    title: String,
    number: String,
    series: Series,
    language: String,
    pages: Int,
    releasedate: Date,
    stories: [Story],
    variants: [Variant],
    verified: Boolean
  }
  
  type Variant implements IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    coverurl: String,
    price: String,
    currency: String,
    variant: String,
    releasedate: Date,
    verified: Boolean
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
        series: (_, {publisher_name}) => models.Series.findAll({
            where: {'$Publisher.name$': publisher_name},
            order: [['title', 'ASC'], ['volume', 'ASC']],
            include: [models.Publisher]
        }),
        issues: async (_, {series_title, series_volume, publisher_name}) => {
            let res = await models.Issue.findAll({
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
        publisher: (_, {publisher_name}) =>
            models.Publisher.findOne({
                where: {
                    name: publisher_name
                }
            }),
        seriesd: (_, {series_title, series_volume, publisher_name}) =>
            models.Series.findOne({
                where: {title: series_title, volume: series_volume, '$Publisher.name$': publisher_name},
                include: [models.Publisher]
            }),
        issue: (_, {issue_number, series_title, series_volume, publisher_name}) =>
            models.Issue.findOne({
                where: {
                    number: issue_number,
                    '$Series.title$': series_title,
                    '$Series.volume$': series_volume,
                    '$Series->Publisher.name$': publisher_name
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
        login: async (_, {name, password}) => {
            var sessionid = "";
            var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?%.,;:-_&$(){}[]";

            for (var i = 0; i < 255; i++)
                sessionid += possible.charAt(Math.floor(Math.random() * possible.length));

            let res = await models.User.update(
                {sessionid: sessionid},
                {where: {name: name, password: password}}
            );

            if (res[0] === 0)
                throw new Error();

            return {id: res[0], sessionid: sessionid};
        },
        logout: async (_, {id, sessionid}) => {
            let res = await models.User.update(
                {sessionid: null},
                {where: {id: id, sessionid: sessionid}}
            );

            return res[0] !== 0;
        },
        deletePublishers: async (_, {publisher_name}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let del = await models.Publisher.destroy({
                where: {name: publisher_name}
            });

            return del === 1;
        },
        deleteSeries: async (_, {series_title, series_volume, publisher_name}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let pub = await models.Publisher.findOne({
                where: {
                    name: publisher_name
                }
            });

            let del = await models.Series.destroy({
                where: {title: series_title, volume: series_volume, fk_publisher: pub.id},
                include: [models.Publisher]
            });

            return del === 1;
        },
        deleteIssues: async (_, {issue_number, series_title, series_volume, publisher_name}, context) => {
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
        createPublisher: async (_, {name}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.create({
                name: name,
                original: false
            });

            if (res)
                return res.dataValues;
        },
        createSeries: async (_, {title, volume, startyear, endyear, publisher_name}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let pub = await models.Publisher.findOne({
                where: {
                    name: publisher_name
                }
            });

            let res = await models.Series.create({
                title: title,
                volume: volume,
                startyear: startyear,
                endyear: endyear,
                fk_publisher: pub.id
            });

            if(res)
                return res.dataValues;
        },
        editPublisher: async (_, {name_old, name}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.findOne({
                where: {
                    name: name_old
                }
            });

            res.name = name;
            res = await res.save();

            return res.dataValues;
        },
        editSeries: async (_, {title_old, volume_old, publisher_old, title, publisher, volume, startyear, endyear}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let newPub = await models.Publisher.findOne({
                where: {
                    name: publisher
                }
            });

            let res = await models.Series.findOne({
                where: {title: title_old, volume: volume_old, '$Publisher.name$': publisher_old},
                include: [models.Publisher]
            });

            res.title = title;
            res.volume = volume;
            res.startyear = startyear;
            res.endyear = endyear;
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
        }) === 1
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
        stories: (parent) => models.Story.findAll({where: {fk_issue: parent.id}}),
        limitation: (parent) => parent.limitation,
        coverurl: (parent) => parent.coverurl,
        price: (parent) => parent.price.toFixed(2).toString().replace(".", ","),
        currency: (parent) => parent.currency,
        language: (parent) => parent.language,
        pages: (parent) => parent.pages,
        releasedate: (parent) => parent.releasedate,
        verified: (parent) => parent.verified
    },
    Variant: {
        id: (parent) => parent.id,
        format: (parent) => parent.format,
        limitation: (parent) => parent.limitation,
        coverurl: (parent) => parent.coverurl,
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