import Sequelize from 'sequelize';
import {gql} from 'apollo-server';
import models from "../models";
import {asyncForEach, generateLabel, generateUrl} from "../util/util";
import matchSorter from "match-sorter";

export const typeDef = gql`
  extend type Query {
    nodes(pattern: String!, us: Boolean!): [Node],
  }
    
  type Node {
    type: String,
    label: String,
    url: String,
  }
`;

export const resolvers = {
    Query: {
        nodes: async (_, {pattern, us}) => {
            let orgiginalPattern = pattern;
            pattern = '%' + pattern.replace(/\s/g, '%') + '%';
            let res = [];

            let publisher = await models.Publisher.findAll({
                where: {
                    original: (us ? 1 : 0),
                    name: {[Sequelize.Op.like]: pattern}
                },
                order: [['name', 'ASC']]
            });

            await asyncForEach(publisher, async p => {
                res.push({
                    type: 'Publisher',
                    label: await generateLabel(p),
                    url: await generateUrl(p, us)
                })
            });

            if (res.length < 25) {
                let series = await models.Series.findAll({
                    attributes: [
                        [Sequelize.fn("concat", Sequelize.col('title'), ' (Vol.', Sequelize.col('volume'), ')'), 'concatinated'],
                        'volume', 'title', 'startyear', 'endyear', 'fk_publisher'],
                    where: {
                        '$Publisher.original$': us ? 1 : 0,
                    },
                    having: {
                        concatinated: {[Sequelize.Op.like]: pattern}
                    },
                    order: [['title', 'ASC'], ['volume', 'ASC']],
                    include: [models.Publisher]
                });

                await asyncForEach(series, async s => {
                    res.push({
                        type: 'Series',
                        label: await generateLabel(s),
                        url: await generateUrl(s, us)
                    })
                });
            }

            if (res.length < 25) {
                let issues = await models.Issue.findAll({
                    attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.title')), 'title'],
                        [models.sequelize.fn('MIN', models.sequelize.col('format')), 'format'],
                        [models.sequelize.fn('MIN', models.sequelize.col('variant')), 'variant'],
                        [Sequelize.fn("concat", Sequelize.col('Series.title'), ' (Vol.', Sequelize.col('Series.volume'), ') #', Sequelize.col('number'), ' (', Sequelize.col('format'), ')'), 'concatinated'],
                        'id', 'number', 'fk_series'],
                    where: {
                        '$Series->Publisher.original$': us ? 1 : 0
                    },
                    group: ['fk_series', 'number'],
                    having: {
                        concatinated: {[Sequelize.Op.like]: pattern}
                    },
                    order: [['number', 'ASC'], ['variant', 'DESC'], ['title', 'DESC'], ['format', 'DESC']],
                    grgenerateUrloup: ['fk_series', 'number'],
                    include: [
                        {
                            model: models.Series,
                            include: [
                                models.Publisher
                            ]
                        }
                    ]
                });

                await asyncForEach(issues, async i => {
                    res.push({
                        type: 'Issue',
                        label: await generateLabel(i),
                        url: await generateUrl(i, us)
                    })
                });
            }

            res = matchSorter(res, orgiginalPattern, {keys: ['label']});
            if (res.length >= 25)
                return res.slice(0, 25);

            return res;
        }
    },
    Node: {
        type: (parent) => parent.type,
        label: (parent) => parent.label,
        url: (parent) => parent.url
    }
};