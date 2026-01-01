"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const sequelize_1 = require("sequelize");
exports.resolvers = {
    Query: {
        individuals: async (_, { pattern, first, after }, { models }) => {
            const limit = first || 50;
            let decodedCursor;
            if (after) {
                decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
            }
            let where = {};
            let order = [['name', 'ASC'], ['id', 'ASC']];
            if (decodedCursor) {
                where[sequelize_1.Op.and] = [
                    sequelize_1.Sequelize.literal(`(name, id) > (SELECT name, id FROM Individual WHERE id = ${decodedCursor})`)
                ];
            }
            if (pattern && pattern !== '') {
                where.name = { [sequelize_1.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
                // Rank-based ordering is tricky with cursors, sticking to stable order
            }
            const results = await models.Individual.findAll({
                where,
                order,
                limit: limit + 1,
            });
            const hasNextPage = results.length > limit;
            const nodes = results.slice(0, limit);
            const edges = nodes.map(node => ({
                cursor: Buffer.from(node.id.toString()).toString('base64'),
                node: node
            }));
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: !!after,
                    startCursor: edges.length > 0 ? edges[0].cursor : null,
                    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
                }
            };
        },
    },
    Individual: {
        id: (parent, _, { loggedIn }) => {
            if (!loggedIn)
                return String(new Date().getTime());
            return String(parent.id);
        },
        name: (parent) => parent.name,
        type: async (parent, _, { models }) => {
            let where = {};
            let table = '';
            if (parent.Stories && parent.Stories.length > 0) {
                where.fk_story = parent.Stories[0].id;
                table = 'Story_Individual';
            }
            else if (parent.Covers && parent.Covers.length > 0) {
                where.fk_cover = parent.Covers[0].id;
                table = 'Cover_Individual';
            }
            else if (parent.Issues && parent.Issues.length > 0) {
                where.fk_issue = parent.Issues[0].id;
                table = 'Issue_Individual';
            }
            else if (parent.Features && parent.Features.length > 0) {
                where.fk_feature = parent.Features[0].id;
                table = 'Feature_Individual';
            }
            else {
                return [];
            }
            where.fk_individual = parent.id;
            let relation = await models[table].findAll({ where });
            return relation.map((r) => r.type);
        },
    },
};
