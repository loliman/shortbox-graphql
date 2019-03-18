import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach} from "../util/util";

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
                    }
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
        }
    }, {
        indexes: [{
            unique: true,
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
    editPublisher(old: PublisherInput!, publisher: PublisherInput!): Publisher
  }
  
  extend type Query {
    publishers(us: Boolean!): [Publisher],
    publisher(publisher: PublisherInput!): Publisher
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
`;

export const resolvers = {
    Query: {
        publishers: (_, {us}) => models.Publisher.findAll({
            where: {original: (us ? 1 : 0)},
            order: [['name', 'ASC']]
        }),
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
                    throw new Error();

                let pub = await models.Publisher.findOne({
                    where: {name: item.name.trim()}
                });

                let del = await pub.delete(transaction);

                transaction.commit();
                return del === 1;;
            } catch (e) {
                transaction.rollback();
                throw e;
            }
        },
        createPublisher: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error();

                let res = await models.Publisher.create({
                    name: item.name.trim(),
                    addinfo: item.addinfo,
                    original: false
                });

                transaction.commit();
                return res;
            } catch (e) {
                transaction.rollback();
                throw e;
            }
        },
        editPublisher: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error();

                let res = await models.Publisher.findOne({
                    where: {
                        name: old.name.trim()
                    }
                });

                res.name = item.name.trim();
                res.addinfo = item.addinfo;
                res = await res.save();

                transaction.commit();
                return res;
            } catch (e) {
                transaction.rollback();
                throw e;
            }
        }
    },
    Publisher: {
        id: (parent) => parent.id,
        name: (parent) => parent.name,
        us: (parent) => parent.original,
        addinfo: (parent) => parent.addinfo
    }
};
