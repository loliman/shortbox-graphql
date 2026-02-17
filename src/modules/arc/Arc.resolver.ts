import { Op } from 'sequelize';
import { ArcResolvers } from '../../types/graphql';
import { buildConnectionFromNodes, decodeCursorId } from '../../core/cursor';

type ArcParent = { id: number; title: string };

export const resolvers: ArcResolvers = {
  Query: {
    arcs: async (_, { pattern, type, first, after }, { models }) => {
      const limit = first || 50;
      const decodedCursor = decodeCursorId(after || undefined);

      const where: Record<string | symbol, unknown> = {};
      const order: Array<[string, 'ASC' | 'DESC']> = [
        ['title', 'ASC'],
        ['id', 'ASC'],
      ];

      if (decodedCursor) {
        const cursorRecord = await models.Arc.findByPk(decodedCursor, {
          attributes: ['id', 'title'],
        });

        if (cursorRecord) {
          const cursorTitle = cursorRecord.get('title') as string | null;
          if (typeof cursorTitle === 'string') {
            where[Op.and] = [
              {
                [Op.or]: [
                  { title: { [Op.gt]: cursorTitle } },
                  { title: cursorTitle, id: { [Op.gt]: decodedCursor } },
                ],
              },
            ];
          } else {
            where[Op.and] = [{ id: { [Op.gt]: decodedCursor } }];
          }
        } else {
          where[Op.and] = [{ id: { [Op.gt]: decodedCursor } }];
        }
      }

      if (pattern && pattern !== '') {
        where.title = { [Op.iLike]: '%' + pattern.replace(/\s/g, '%') + '%' };
      }

      if (type) where.type = { [Op.eq]: type.toUpperCase() };

      const results = await models.Arc.findAll({
        where,
        order,
        limit: limit + 1,
      });
      return buildConnectionFromNodes(results, limit, after || undefined);
    },
  },
  Arc: {
    id: (parent, _, { loggedIn }) => {
      const arcParent = parent as ArcParent;
      if (!loggedIn) return String(new Date().getTime());
      return String(arcParent.id);
    },
    title: (parent) => (parent as ArcParent).title.trim(),
    issues: async (parent, _, { models }) =>
      await models.Issue.findAll({
        include: [
          {
            model: models.Arc,
            where: { id: (parent as ArcParent).id },
          },
        ],
      }),
  },
};
