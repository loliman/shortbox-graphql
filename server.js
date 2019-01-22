const {ApolloServer, gql} = require('apollo-server-express');
import express from 'express';
import fs from 'fs';
import https from 'https';
import {GraphQLScalarType} from 'graphql';
import models from './models';
import sequelize from './config/database';
import {createContext, EXPECTED_OPTIONS_KEY} from 'dataloader-sequelize';
import {resolver} from 'graphql-sequelize';

var dateFormat = require('dateformat');

var reA = /[^a-zA-Z]/g;
var reN = /[^0-9]/g;

const typeDefs = gql`
  scalar Date

  type Query {
    publishers(us: Boolean!): [Publisher],
    series(publisher_id: Int!): [Series],
    issues(series_id: Int!): [Issue],
    issue(id: Int!): Issue
  }
  
  type Mutation {
    login(name: String!, password: String!): User,
    logout(id: Int!, sessionid: String!): Boolean,
    
    deletePublishers(id: Int!): Boolean,
    deleteSeries(id: Int!): Boolean,
    deleteIssues(id: Int!): Boolean,
    
    editPublisher(id: Int!, name: String!): Publisher
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
    releasedate: Date
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
    variants: [Variant]
  }
  
  type Variant implements IssueBase {
    id: ID,
    format: String,
    limitation: Int,
    coverurl: String,
    price: String,
    currency: String,
    variant: String,
    releasedate: Date
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
        publishers: (_, {us}) => models.Publisher.findAll({where: {original: (us ? 1 : 0)}, order: [['name', 'ASC']]}),
        series: (_, {publisher_id}) => models.Series.findAll({
            where: {fk_publisher: publisher_id},
            order: [['title', 'ASC'], ['volume', 'ASC']]
        }),
        issues: async (_, {series_id}) => {
            let res = await models.Issue.findAll({
                where: {fk_series: series_id, fk_variant: null},
                order: [['number', 'ASC']]
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
        issue: (_, {id}) => models.Issue.findById(id)
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
        deletePublishers: async (_, {id}, context) => {
            if (!context.loggedIn)
                throw new Error();

            console.log("deleted publisher " + id);
            return true;
            /*let del = await models.Publisher.destroy({where: {id: id}});
            return del === 1;*/
        },
        deleteSeries: async (_, {id}, context) => {
            if (!context.loggedIn)
                throw new Error();

            console.log("deleted series " + id);
            return true;
            /*let del = await models.Series.destroy({where: {id: id}});
            return del === 1;*/
        },
        deleteIssues: async (_, {id}, context) => {
            if (!context.loggedIn)
                throw new Error();

            console.log("deleted issue " + id);
            return true;
            /*let del = await models.Issue.destroy({where: {id: id}});
            return del === 1;*/
        },
        editPublisher: async (_, {id, name}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.update(
                {name: name},
                {where: {id: id}}
            );

            if(res[0] !== 0)
                return {id: id, name: name};
        }
    },
    Publisher: {
        id: (parent) => parent.id,
        name: (parent) => parent.name,
        us: (parent) => parent.original === 1
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
        children: (parent) => models.Story.findAll({where: {fk_parent: parent.id}}),
        firstapp: async (parent) => {
            let res = await sequelize.query("SELECT i.id FROM Issue i JOIN Story s ON s.fk_issue = i.id WHERE s.fk_parent = ? ORDER BY i.releasedate ASC LIMIT 1",
                {replacements: [parent.fk_parent], type: sequelize.QueryTypes.SELECT});

            if (res.length === 0)
                return false;

            return res[0].id === parent.fk_issue;
        }
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
        releasedate: (parent) => parent.releasedate
    },
    Variant: {
        id: (parent) => parent.id,
        format: (parent) => parent.format,
        limitation: (parent) => parent.limitation,
        coverurl: (parent) => parent.coverurl,
        price: (parent) => parent.price.toFixed(2).toString().replace(".", ","),
        currency: (parent) => parent.currency,
        releasedate: (parent) => parent.releasedate,
        variant: (parent) => parent.variant
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
        // add the user to the context
        return {loggedIn, dataloader};
    }
});

const app = express();
apollo.applyMiddleware({app});

const server = https.createServer(
    {
        key: fs.readFileSync(`/Users/Christian/example.com+5-key.pem`),
        cert: fs.readFileSync(`/Users/Christian/example.com+5.pem`)
    },
    app
);

apollo.installSubscriptionHandlers(server);

export default server;