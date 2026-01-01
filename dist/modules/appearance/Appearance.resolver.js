"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const sequelize_1 = require("sequelize");
exports.resolvers = {
    Query: {
        apps: async (_, { pattern, type, first, after }, { models }) => {
            const limit = first || 50;
            let decodedCursor;
            if (after) {
                decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
            }
            let where = {};
            let order = [['name', 'ASC'], ['id', 'ASC']];
            if (decodedCursor) {
                where[sequelize_1.Op.and] = [
                    sequelize_1.Sequelize.literal(`(name, id) > (SELECT name, id FROM Appearance WHERE id = ${decodedCursor})`)
                ];
            }
            if (pattern && pattern !== '') {
                where.name = { [sequelize_1.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
            }
            if (type)
                where.type = { [sequelize_1.Op.like]: type.toUpperCase() };
            const results = await models.Appearance.findAll({
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
    Appearance: {
        id: (parent, _, { loggedIn }) => {
            if (!loggedIn)
                return String(new Date().getTime());
            return String(parent.id);
        },
        name: (parent) => parent.name.trim(),
        type: (parent) => (parent.type.trim() === '' ? 'CHARACTER' : parent.type),
        role: async (parent, _, { models }) => {
            if (!parent.Stories || parent.Stories.length === 0)
                return '';
            let relation = await models.Story_Appearance.findOne({
                where: {
                    fk_story: parent.Stories[0].id,
                    fk_appearance: parent.id,
                },
            });
            return relation ? relation.role : '';
        },
    },
};
