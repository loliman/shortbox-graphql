import { Op } from 'sequelize';
import { AppearanceResolvers } from '../../types/graphql';
import { buildConnectionFromNodes, decodeCursorId } from '../../core/cursor';

type AppearanceParent = {
  id: number;
  name: string;
  type: string;
  Stories?: Array<{ id: number }>;
  Story_Appearance?: { role?: string | null };
};

export const resolvers: AppearanceResolvers = {
  Query: {
    apps: async (_, { pattern, type, first, after }, { models }) => {
      const limit = first || 50;
      const decodedCursor = decodeCursorId(after || undefined);

      const where: Record<string | symbol, unknown> = {};
      const order: Array<[string, 'ASC' | 'DESC']> = [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ];

      if (decodedCursor) {
        const cursorRecord = await models.Appearance.findByPk(decodedCursor, {
          attributes: ['id', 'name'],
        });

        if (cursorRecord) {
          const cursorName = cursorRecord.get('name') as string | null;
          if (typeof cursorName === 'string') {
            where[Op.and] = [
              {
                [Op.or]: [
                  { name: { [Op.gt]: cursorName } },
                  { name: cursorName, id: { [Op.gt]: decodedCursor } },
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
        where.name = { [Op.iLike]: '%' + pattern.replace(/\s/g, '%') + '%' };
      }

      if (type) where.type = { [Op.iLike]: type.toUpperCase() };

      const results = await models.Appearance.findAll({
        where,
        order,
        limit: limit + 1,
      });
      return buildConnectionFromNodes(results, limit, after || undefined);
    },
  },
  Appearance: {
    id: (parent, _, { loggedIn }) => {
      const appearanceParent = parent as AppearanceParent;
      if (!loggedIn) return String(new Date().getTime());
      return String(appearanceParent.id);
    },
    name: (parent) => (parent as AppearanceParent).name.trim(),
    type: (parent) => {
      const appearanceParent = parent as AppearanceParent;
      return appearanceParent.type.trim() === '' ? 'CHARACTER' : appearanceParent.type;
    },
    role: async (parent, _, { models }) => {
      const appearanceParent = parent as AppearanceParent;
      if (appearanceParent.Story_Appearance) {
        return appearanceParent.Story_Appearance.role || '';
      }
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
