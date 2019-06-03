import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";
import {asyncForEach} from "../util/util";
import {createFilterQuery} from "../graphql/Filter";

class Series extends Model {
    static tableName = 'Series';

    static associate(models) {
        Series.hasMany(models.Issue, {as: 'Issue', foreignKey: 'fk_series', onDelete: 'cascade'});

        Series.belongsTo(models.Publisher, {foreignKey: 'fk_publisher'})
    }

    async delete(transaction) {
        return new Promise(async (resolve, reject) => {
            try {
                let issues = await models.Issue.findAll({
                    where: {
                        fk_series: this.id
                    },
                    transaction
                });

                await asyncForEach(issues, async (issue) => {
                    await issue.delete(transaction);
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
    Series.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(255)
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
        },
        volume: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['title', 'volume', 'fk_publisher']
        }],
        sequelize,
        tableName: Series.tableName
    });

    return Series;
};

export const typeDef = gql`
  extend type Mutation {
    deleteSeries(item: SeriesInput!): Boolean,
    createSeries(item: SeriesInput!): Series,
    editSeries(old: SeriesInput!, item: SeriesInput!): Series
  }
  
  extend type Query {
    series(publisher: PublisherInput!, filter: Filter): [Series],
    seriesd(series: SeriesInput!): Series
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
`;

export const resolvers = {
    Query: {
        series: async (_, {publisher, filter}) => {
            if(!filter) {
                let options = {
                    order: [['title', 'ASC'], ['volume', 'ASC']],
                    include: [models.Publisher],
                };

                if (publisher.name !== "*")
                    options.where = {'$Publisher.name$': publisher.name};

                if (publisher.us !== undefined)
                    options.where = {'$Publisher.original$': publisher.us ? 1 : 0};

                return await models.Series.findAll(options);
            } else {
                let rawQuery = createFilterQuery(publisher, filter);
                let res = await models.sequelize.query(rawQuery);
                let series = [];
                res[0].forEach(s => {
                    series.push({
                        title: s.seriestitle,
                        volume: s.seriesvolume,
                        startyear: s.seriesstartyear,
                        endyear: s.seriesendyear,
                        fk_publisher: s.publisherid
                    });
                });

                return series;
            }
        },
        seriesd: (_, {series}) =>
            models.Series.findOne({
                where: {title: series.title, volume: series.volume, '$Publisher.name$': series.publisher.name},
                include: [models.Publisher]
            }),
    },
    Mutation: {
        deleteSeries: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let pub = await models.Publisher.findOne({
                    where: {
                        name: item.publisher.name.trim()
                    },
                    transaction
                });

                let series = await models.Series.findOne({
                    where: {title: item.title.trim(), volume: item.volume, fk_publisher: pub.id},
                    include: [models.Publisher],
                    transaction
                });

                let del = await series.delete(transaction);

                await transaction.commit();
                return del === 1;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        createSeries: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let pub = await models.Publisher.findOne({
                    where: {
                        name: item.publisher.name.trim()
                    },
                    transaction
                });

                let res = await models.Series.create({
                    title: item.title.trim(),
                    volume: item.volume,
                    startyear: item.startyear,
                    endyear: item.endyear,
                    addinfo: item.addinfo,
                    fk_publisher: pub.id
                }, {transaction: transaction});

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        editSeries: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let oldPub = await models.Publisher.findOne({
                    where: {
                        name: old.publisher.name.trim()
                    },
                    transaction
                });

                let newPub = await models.Publisher.findOne({
                    where: {
                        name: item.publisher.name.trim()
                    },
                    transaction
                });

                if(oldPub.original !== newPub.original)
                    throw new Error("You must not change to another publisher type");

                let res = await models.Series.findOne({
                    where: {title: old.title.trim(), volume: old.volume, '$Publisher.name$': old.publisher.name},
                    include: [models.Publisher],
                    transaction
                });

                res.title = item.title.trim();
                res.volume = item.volume;
                res.startyear = item.startyear;
                res.endyear = item.endyear;
                res.addinfo = item.addinfo;
                res.setPublisher(newPub, {transaction: transaction});
                res = await res.save({transaction: transaction});

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },
    Series: {
        id: (parent) => parent.id,
        title: (parent) => parent.title,
        startyear: (parent) => parent.startyear,
        endyear: (parent) => parent.endyear,
        volume: (parent) => parent.volume,
        addinfo: (parent) => parent.addinfo,
        publisher: async (parent) => await models.Publisher.findById(parent.fk_publisher),
    }
};