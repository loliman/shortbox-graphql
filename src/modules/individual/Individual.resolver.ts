import { Sequelize, Op } from 'sequelize';
import { IndividualResolvers } from '../../types/graphql';

export const resolvers: IndividualResolvers = {
  Query: {
    individuals: async (_, { pattern, first, after }, { models }) => {
      const limit = first || 50;
      let decodedCursor: number | undefined;
      if (after) {
        decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
      }

      let where: any = {};
      let order: any = [['name', 'ASC'], ['id', 'ASC']];

      if (decodedCursor) {
        where[Op.and as any] = [
          Sequelize.literal(`(name, id) > (SELECT name, id FROM Individual WHERE id = ${decodedCursor})`)
        ];
      }

      if (pattern && pattern !== '') {
        where.name = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
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
  Individual: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    name: (parent) => parent.name,
    type: async (parent, _, { models }) => {
      let where: any = {};
      let table: 'Story_Individual' | 'Cover_Individual' | 'Issue_Individual' | 'Feature_Individual' | '' = '';

      if ((parent as any).Stories && (parent as any).Stories.length > 0) {
        where.fk_story = (parent as any).Stories[0].id;
        table = 'Story_Individual';
      } else if ((parent as any).Covers && (parent as any).Covers.length > 0) {
        where.fk_cover = (parent as any).Covers[0].id;
        table = 'Cover_Individual';
      } else if ((parent as any).Issues && (parent as any).Issues.length > 0) {
        where.fk_issue = (parent as any).Issues[0].id;
        table = 'Issue_Individual';
      } else if ((parent as any).Features && (parent as any).Features.length > 0) {
        where.fk_feature = (parent as any).Features[0].id;
        table = 'Feature_Individual';
      } else {
        return [];
      }

      where.fk_individual = parent.id;
      let relation = await (models[table] as any).findAll({ where });
      return relation.map((r: any) => r.type);
    },
  },
};
