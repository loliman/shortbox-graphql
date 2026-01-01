import { Sequelize, Op } from 'sequelize';
import { ArcResolvers } from '../../types/graphql';

export const resolvers: ArcResolvers = {
  Query: {
    arcs: async (_, { pattern, type, first, after }, { models }) => {
      const limit = first || 50;
      let decodedCursor: number | undefined;
      if (after) {
        decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
      }

      let where: any = {};
      let order: any = [['title', 'ASC'], ['id', 'ASC']];

      if (decodedCursor) {
        where[Op.and as any] = [
          Sequelize.literal(`(title, id) > (SELECT title, id FROM Arc WHERE id = ${decodedCursor})`)
        ];
      }

      if (pattern && pattern !== '') {
        where.title = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
      }

      if (type) where.type = { [Op.eq]: type.toUpperCase() };

      const results = await models.Arc.findAll({
        where,
        order,
        limit: limit + 1,
      });

      const hasNextPage = results.length > limit;
      const nodes = results.slice(0, limit);

      const edges = nodes.map(node => ({
        cursor: Buffer.from(node.id.toString()).toString('base64'),
        node: node as any
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
  Arc: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    title: (parent) => parent.title.trim(),
    issues: async (parent, _, { models }) =>
      (await models.Issue.findAll({
        include: [
          {
            model: models.Arc as any,
            where: { id: parent.id },
          },
        ],
      })) as any,
  },
};
