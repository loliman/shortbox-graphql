import { Sequelize, Op } from 'sequelize';
import { AppearanceResolvers } from '../../types/graphql';

type AppearanceParent = {
  id: number;
  name: string;
  type: string;
  Stories?: Array<{ id: number }>;
};

export const resolvers: AppearanceResolvers = {
  Query: {
    apps: async (_, { pattern, type, first, after }, { models }) => {
      const limit = first || 50;
      let decodedCursor: number | undefined;
      if (after) {
        decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
      }

      const where: Record<string | symbol, unknown> = {};
      const order: Array<[string, 'ASC' | 'DESC']> = [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ];

      if (decodedCursor) {
        where[Op.and] = [
          Sequelize.literal(
            `(name, id) > (SELECT name, id FROM Appearance WHERE id = ${decodedCursor})`,
          ),
        ];
      }

      if (pattern && pattern !== '') {
        where.name = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
      }

      if (type) where.type = { [Op.like]: type.toUpperCase() };

      const results = await models.Appearance.findAll({
        where,
        order,
        limit: limit + 1,
      });

      const hasNextPage = results.length > limit;
      const nodes = results.slice(0, limit);

      const edges = nodes.map((node) => ({
        cursor: Buffer.from(node.id.toString()).toString('base64'),
        node,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        },
      };
    },
  },
  Appearance: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    name: (parent) => parent.name.trim(),
    type: (parent) => (parent.type.trim() === '' ? 'CHARACTER' : parent.type),
    role: async (parent, _, { models }) => {
      const appearanceParent = parent as unknown as AppearanceParent;
      if (!appearanceParent.Stories || appearanceParent.Stories.length === 0) return '';
      let relation = await models.Story_Appearance.findOne({
        where: {
          fk_story: appearanceParent.Stories[0].id,
          fk_appearance: appearanceParent.id,
        },
      });
      return relation ? (relation as { role?: string }).role || '' : '';
    },
  },
};
