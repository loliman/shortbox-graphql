const { ApolloServer, gql } = require('apollo-server');
import {GraphQLScalarType} from 'graphql';
import crypto from 'crypto';
import models from './models';
import {createContext, EXPECTED_OPTIONS_KEY} from 'dataloader-sequelize';
import {resolver} from 'graphql-sequelize';
import fs from 'fs'

var dateFormat = require('dateformat');

var reA = /[^a-zA-Z]/g;
var reN = /[^0-9]/g;

const typeDefs = gql`
  scalar Date
  scalar DateTime
  
  type Query {
    publishers(us: Boolean!): [Publisher],
    series(publisher: PublisherInput!): [Series],
    issues(series: SeriesInput!): [Issue],
    individuals: [Individual],
        
    lastEdited: [Issue],
    
    publisher(publisher: PublisherInput!): Publisher,
    seriesd(series: SeriesInput!): Series,
    issue(issue: IssueInput!): Issue
  }
  
  type Mutation {
    login(user: UserInput!): User,
    logout(user: UserInput!): Boolean,
    
    deletePublisher(item: PublisherInput!): Boolean,
    deleteSeries(item: SeriesInput!): Boolean,
    deleteIssue(item: IssueInput!): Boolean,
    
    createPublisher(item: PublisherInput!): Publisher,
    createSeries(item: SeriesInput!): Series,
    createIssue(item: IssueInput!): Issue,
        
    editPublisher(old: PublisherInput!, publisher: PublisherInput!): Publisher,
    editSeries(old: SeriesInput!, item: SeriesInput!): Series,
    editIssue(old: SeriesInput!, item: IssueInput!): Issue,
    
    verifyIssue(item: IssueInput!): Issue
  }
  
  input PublisherInput {
    id: String,
    name: String,
    us: Boolean,
    addinfo: String
  }
  
  type Publisher {
    id: ID,
    name: String,
    series: [Series],
    us: Boolean,
    addinfo: String
  }
  
  input SeriesInput {
    id: String,
    title: String,
    startyear: Int,
    endyear: Int,
    volume: Int,
    addinfo: String,
    publisher: PublisherInput
  }
  
  type Series {
    id: ID,
    title: String,
    startyear: Int,
    endyear: Int,
    volume: Int,
    addinfo: String,
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
    number: Int!,
    writer: IndividualInput,
    title: String,
    addinfo: String,
    exclusive: Boolean
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
  
  input CoverInput {
    number: Int!,
    parent: CoverInput,
    issue: IssueInput,
    artist: IndividualInput,
    addinfo: String,
    exclusive: Boolean
  }
  
  type Cover {
    id: ID,
    url: String,
    number: Int,
    addinfo: String,
    parent: Cover,
    children: [Cover],
    firstapp: Boolean,
    exclusive: Boolean,
    issue: Issue,
    artists: [Individual]
  }

  input IssueInput {
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
    language: String,
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

            return dateFormat(new Date(value), "yyyy-mm-dd");
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.INT) {
                return parseInt(ast.value, 10);
            }
            return null;
        },
    }),
    DateTime: new GraphQLScalarType({
        name: 'DateTime',
        description: 'DateTime custom scalar type',
        serialize(value) {
            return dateFormat(new Date(value.toLocaleString()), "dd.mm.yyyy HH:mm");
        }
    }),
    Query: {
        publishers: (_, {us}) => models.Publisher.findAll({
            where: {original: (us ? 1 : 0)},
            order: [['name', 'ASC']]
        }),
        series: (_, {publisher}) => {
            let options = {
                order: [['title', 'ASC'], ['volume', 'ASC']],
                include: [models.Publisher]
            };

            if (publisher.name !== "*")
                options.where = {'$Publisher.name$': publisher.name};

            if (publisher.us !== undefined)
                options.where = {'$Publisher.original$': publisher.us ? 1 : 0};

            return models.Series.findAll(options);
        },
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
        individuals: () => models.Individual.findAll({
            order: [['name', 'ASC']]
        }),
        lastEdited: () => models.Issue.findAll({
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
            limit: 25}),
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
        issue: (_, {issue}) => {
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

            return models.Issue.findOne({
                where: where,
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            })
        }
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
        deletePublisher: async (_, {item}, context) => {
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
        deleteIssue: async (_, {item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let series = await models.Series.findOne({
                where: {
                    title: item.series.title.trim(),
                    volume: item.series.volume,
                    '$Publisher.name$': item.series.publisher.name.trim()
                },
                include: [models.Publisher]
            });

            let issue = await models.Issue.findOne({
                where: {
                    number: item.number.trim(),
                    fk_series: series.id,
                    format: item.format.trim(),
                    variant: item.variant.trim()
                },
            });

            let cover = await models.Cover.findOne({
                where: {fk_issue: issue.id}
            });

            fs.unlinkSync(cover.url);

            await cover.destroy();
            let del = await issue.destroy();

            return del === 1;
        },
        createPublisher: async (_, {item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.create({
                name: item.name.trim(),
                addinfo: item.addinfo,
                original: false
            });

            if (res)
                return res.dataValues;
        },
        createSeries: async (_, {item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let pub = await models.Publisher.findOne({
                where: {
                    name: item.publisher.name.trim()
                }
            });

            let res = await models.Series.create({
                title: item.title.trim(),
                volume: item.volume,
                startyear: item.startyear,
                endyear: item.endyear,
                addinfo: item.addinfo,
                fk_publisher: pub.id
            });

            if(res)
                return res.dataValues;
        },
        createIssue: async (_, {item}, context) => {
            if (!context.loggedIn)
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
                price: item.price && issue.price !== '' ? issue.price : 0,
                currency: item.currency,
                addinfo: item.addinfo
            });

            if (item.cover) {
                const {createReadStream, filename} = await item.cover;
                const stream = createReadStream();
                const {path} = await store({stream, filename});

                let cover = await models.Cover.create({
                    url: path,
                    number: 0,
                    addinfo: ''
                });

                cover.setIssue(res);
                cover = await cover.save();
                res.dataValues.cover = cover;
            }

            if (res)
                return res.dataValues;
        },
        editPublisher: async (_, {old, item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let res = await models.Publisher.findOne({
                where: {
                    name: old.name.trim()
                }
            });

            res.name = item.name.trim();
            res.addinfo = item.addinfo;
            res = await res.save();

            return res.dataValues;
        },
        editSeries: async (_, {old, item}, context) => {
            if (!context.loggedIn)
                throw new Error();

            let newPub = await models.Publisher.findOne({
                where: {
                    name: item.publisher.name.trim()
                }
            });

            let res = await models.Series.findOne({
                where: {title: old.title.trim(), volume: old.volume, '$Publisher.name$': old.publisher.name},
                include: [models.Publisher]
            });

            res.title = item.title.trim();
            res.volume = item.volume;
            res.startyear = item.startyear;
            res.endyear = item.endyear;
            res.addinfo = item.addinfo;
            res.setPublisher(newPub);
            res = await res.save();

            return res.dataValues;
        },
        editIssue: async (_, {old, item}, context) => {
            return item;
        },
        verifyIssue: async (_, {item}, context) => {
            if (!context.loggedIn)
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

            return res.dataValues;
        },
    },
    Publisher: {
        id: (parent) => parent.id,
        name: (parent) => parent.name,
        us: (parent) => parent.original,
        addinfo: (parent) => parent.addinfo
    },
    Series: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        startyear: (parent) => parent.startyear,
        endyear: (parent) => parent.endyear,
        volume: (parent) => parent.volume,
        addinfo: (parent) => parent.addinfo,
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
        firstapp: async (parent) => {
            let stories = await models.Story.findAll({
                where: {fk_parent: parent.fk_parent},
                include: [models.Issue],
                order: [[models.Issue, 'releasedate', 'ASC'], [models.Issue, 'variant', 'ASC']]
            });

            return (stories.length > 0 && stories[0].id === parent.id);
        },
        exclusive: async (parent) => {
            return parent.fk_parent === null;
        },
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
        firstapp: async (parent) => {
            let cover = await models.Cover.findAll({
                where: {fk_parent: parent.fk_parent},
                include: [models.Issue],
                order: [[models.Issue, 'releasedate', 'ASC'], [models.Issue, 'variant', 'ASC']]
            });

            return (cover.length > 0 && cover[0].id === parent.id);
        },
        exclusive: async (parent) => {
            return parent.fk_parent === null;
        },
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
    Issue: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        number: (parent) => parent.number,
        format: (parent) => parent.format,
        series: (parent) => models.Series.findById(parent.fk_series),
        variants: (parent) => {
            return models.Issue.findAll({
                where: {fk_series: parent.fk_series, number: parent.number},
                order: [['releasedate', 'ASC'], ['variant', 'ASC']]
            })
        },
        variant: (parent) => parent.variant,
        features: (parent) => models.Feature.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]}),
        stories: (parent) => models.Story.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]}),
        covers: (parent) => models.Cover.findAll({where: {fk_issue: parent.id}, order: [['number', 'ASC']]}),
        limitation: (parent) => parent.limitation,
        cover: (parent) => models.Cover.findOne({where: {fk_issue: parent.id, number: 0}}),
        price: (parent) => parent.price.toFixed(2).toString(),
        currency: (parent) => parent.currency,
        language: (parent) => parent.language,
        pages: (parent) => parent.pages,
        releasedate: (parent) => parent.releasedate,
        verified: (parent) => parent.verified,
        addinfo: (parent) => parent.addinfo,
        editors: (parent) => models.Individual.findAll({
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
    },
    User: {
        id: (parent) => parent.id,
        sessionid: (parent) => parent.sessionid
    }
};

resolver.contextToOptions = {dataloader: EXPECTED_OPTIONS_KEY};

const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({req}) => {
        let loggedIn = false;
        if(req.headers.authorization) {
            let userid = req.headers.authorization.split(/:(.+)/)[0];
            let sessionid = req.headers.authorization.split(/:(.+)/)[1];

            let user = await models.User.count({where: {id: userid, sessionid: sessionid}});
            if (user === 1)
                loggedIn = true;
        }

        const dataloader = createContext(models.sequelize);
        return {loggedIn, dataloader};
    },
    uploads: {
        maxFileSize: 10000000 // 10 MB
    }
});

const store = ({stream, filename}) => {
    let hash = crypto.createHash('sha256').update(filename).digest('hex');
    let path = hash;

    return new Promise((resolve, reject) =>
        stream
            .on('error', error => {
                if (stream.truncated)
                    fs.unlinkSync(path);
                reject(error)
            })
            .pipe(fs.createWriteStream(path))
            .on('error', error => reject(error))
            .on('finish', () => resolve({path}))
    )
};

export default server;