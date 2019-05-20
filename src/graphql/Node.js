import Sequelize from 'sequelize';
import {gql} from 'apollo-server';
import models from "../models";
import {asyncForEach, generateLabel, generateUrl, naturalCompare} from "../util/util";

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

            if (res.length >= 15)
                return res.slice(0, 14);

            let series = await models.Series.findAll({
                where: {
                    '$Publisher.original$': us ? 1 : 0,
                    title: {[Sequelize.Op.like]: pattern}
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

            if (res.length >= 15)
                return res.slice(0, 14);

            let issues = await models.Issue.findAll({
                attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.title')), 'title'],
                    [models.sequelize.fn('MIN', models.sequelize.col('format')), 'format'],
                    [models.sequelize.fn('MIN', models.sequelize.col('variant')), 'variant'],
                    [Sequelize.fn("concat", Sequelize.col('Series.title'), ' ', Sequelize.col('number')), 'concatinated'],
                    'id', 'number', 'fk_series'],
                where: {
                    '$Series->Publisher.original$': us ? 1 : 0
                },
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

            issues = await issues.sort((a, b) => naturalCompare(a.number, b.number));
            await asyncForEach(issues, async i => {
                res.push({
                    type: 'Issue',
                    label: await generateLabel(i),
                    url: await generateUrl(i, us)
                })
            });

            if (res.length >= 15)
                return res.slice(0, 14);

            return res;
        }
    },
    Node: {
        type: (parent) => parent.type,
        label: (parent) => parent.label,
        url: (parent) => parent.url
    }
};