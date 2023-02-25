import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach} from "../util/util";
import {createFilterQuery} from "../graphql/Filter";

class Publisher extends Model {
    static tableName = 'Publisher';

    static associate(models) {
        Publisher.hasMany(models.Series, {as: 'Series', foreignKey: 'fk_publisher', onDelete: 'cascade'});
    }

    async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let series = await models.Series.findAll({
                    where: {
                        fk_publisher: this.id
                    },
                    transaction
                });

                await asyncForEach(series, async (series) => {
                    await series.delete(transaction);
                });

                let del = await this.destroy({transaction});
                resolve(del);
            } catch (e) {
                reject(e);
            }
        });
    }
}

export default (sequelize) => {
    Publisher.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        original: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        },
        startyear: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        endyear: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }, {
            fields: ['id']
        }, {
            fields: ['name']
        }],
        sequelize,
        tableName: Publisher.tableName
    });

    return Publisher;
};

export const typeDef = gql`
  extend type Mutation {
    deletePublisher(item: PublisherInput!): Boolean,
    createPublisher(item: PublisherInput!): Publisher,    
    editPublisher(old: PublisherInput!, item: PublisherInput!): Publisher
  }
  
  extend type Query {
    publishers(pattern: String, us: Boolean!, offset: Int, filter: Filter): [Publisher],
    publisher(publisher: PublisherInput!): Publisher
  }
  
  input PublisherInput {
    id: String,
    name: String,
    us: Boolean,
    addinfo: String,
    startyear: Int,
    endyear: Int
  }
    
  type Publisher {
    id: ID,
    name: String,
    series: [Series],
    us: Boolean,
    seriesCount: Int,
    issueCount: Int,
    firstIssue: Issue,
    lastIssue: Issue,
    startyear: Int,
    endyear: Int,
    active: Boolean,
    addinfo: String
  }
`;

export const resolvers = {
    Query: {
        publishers: async (_, {pattern, us, offset, filter}, context) => {
            const {loggedIn, transaction} = context;

            if (!filter) {
                let options = {};

                options.where = {original: (us ? 1 : 0)};
                options.order = [['name', 'ASC']];

                if (offset !== undefined) {
                    options.offset = offset;
                    options.limit = 50;
                }

                if (pattern && pattern !== '') {
                    options.where.name = {[Sequelize.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%'};
                    options.order = [[models.sequelize.literal("CASE " +
                        "   WHEN name LIKE '" + pattern + "' THEN 1 " +
                        "   WHEN name LIKE '" + pattern + "%' THEN 2 " +
                        "   WHEN name LIKE '%" + pattern + "' THEN 4 " +
                        "   ELSE 3 " +
                        "END"), 'ASC']];
                }

                return await models.Publisher.findAll(options);
            } else {
                let rawQuery = createFilterQuery(loggedIn, us, filter, offset);
                let res = await models.sequelize.query(rawQuery);
                let publishers = [];
                res[0].forEach(p => publishers.push({
                    name: p.publishername,
                    us: us
                }));
                return publishers;
            }
        },
        publisher: (_, {publisher}) => models.Publisher.findOne({
            where: {
                name: publisher.name
            }
        })
    },
    Mutation: {
        deletePublisher: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let pub = await models.Publisher.findOne({
                    where: {name: item.name.trim()},
                    transaction
                });

                let del = await pub.delete(transaction);

                await transaction.commit();
                return del === 1;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        createPublisher: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await models.Publisher.create({
                    name: item.name.trim(),
                    addinfo: item.addinfo,
                    original: item.us,
                    startyear: item.startyear,
                    endyear: item.endyear
                }, {transaction: transaction});

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        editPublisher: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await models.Publisher.findOne({
                    where: {
                        name: old.name.trim(),
                    },
                    transaction
                });

                res.name = item.name.trim();
                res.addinfo = item.addinfo;
                res.startyear = item.startyear;
                res.endyear = item.endyear;
                res = await res.save({transaction: transaction});

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },
    Publisher: {
        id: (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return new Date();

            return parent.id;
        },
        name: (parent) => parent.name,
        us: (parent) => parent.original,
        seriesCount: async (parent) => await models.Series.count({where: {fk_publisher: parent.id}}),
        issueCount: async (parent) => {
            let res = await models.Issue.findAll({
                where: {
                    '$Series->Publisher.id$': parent.id
                },
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

            return res ? res.length : 0;
        },
        firstIssue: async (parent) => {
            let res = await models.Issue.findAll({
                where: {
                    '$Series->Publisher.id$': parent.id
                },
                group: ['fk_series', 'number'],
                order: [['releasedate', 'ASC'], ['number', 'ASC'], ['format', 'ASC']],
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });

            return res && res.length > 0 ? res[0] : null;
        },
        lastIssue: async (parent) => {
            let res = await models.Issue.findAll({
                where: {
                    '$Series->Publisher.id$': parent.id
                },
                group: ['fk_series', 'number'],
                order: [['releasedate', 'DESC'], ['number', 'DESC'], ['format', 'DESC']],
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });

            return res && res.length > 0 ? res[0] : null;
        },
        startyear: (parent) => parent.startyear,
        endyear: (parent) => parent.endyear,
        active: (parent) => !(parent.startyear && parent.endyear),
        addinfo: (parent) => parent.addinfo
    }
};
