import { Op } from 'sequelize';
import { IndividualResolvers } from '../../types/graphql';
import { buildConnectionFromNodes, decodeCursorId } from '../../core/cursor';

type IndividualParent = {
  id: number;
  name: string;
  stories?: Array<{ id: number }>;
  covers?: Array<{ id: number }>;
  issues?: Array<{ id: number }>;
  story_individual?: { type?: unknown } | null;
  cover_individual?: { type?: unknown } | null;
  issue_individual?: { type?: unknown } | null;
};

const toTypeArray = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  const normalized = value.trim();
  return normalized ? [normalized] : [];
};

export const resolvers: IndividualResolvers = {
  Query: {
    individuals: async (_, { pattern, first, after }, { models }) => {
      const limit = first || 50;
      const decodedCursor = decodeCursorId(after || undefined);

      const where: Record<string | symbol, unknown> = {};
      const order: Array<[string, 'ASC' | 'DESC']> = [
        ['name', 'ASC'],
        ['id', 'ASC'],
      ];

      if (decodedCursor) {
        const cursorRecord = await models.Individual.findByPk(decodedCursor, {
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
        // Rank-based ordering is tricky with cursors, sticking to stable order
      }

      const results = await models.Individual.findAll({
        where,
        order,
        limit: limit + 1,
      });
      return buildConnectionFromNodes(results, limit, after || undefined);
    },
  },
  Individual: {
    id: (parent, _, { loggedIn }) => {
      const individualParent = parent as IndividualParent;
      if (!loggedIn) return String(new Date().getTime());
      return String(individualParent.id);
    },
    name: (parent) => (parent as IndividualParent).name,
    type: async (parent, _, { models }) => {
      const individualParent = parent as IndividualParent;
      const directTypes = [
        ...toTypeArray(individualParent.story_individual?.type),
        ...toTypeArray(individualParent.cover_individual?.type),
        ...toTypeArray(individualParent.issue_individual?.type),
      ];
      if (directTypes.length > 0) {
        return [...new Set(directTypes)];
      }

      const where: Record<string, number> = {};
      let table: 'Story_Individual' | 'Cover_Individual' | 'Issue_Individual' | '' = '';

      const { stories, covers, issues } = individualParent;

      if (stories && stories.length > 0) {
        where.fk_story = stories[0].id;
        table = 'Story_Individual';
      } else if (covers && covers.length > 0) {
        where.fk_cover = covers[0].id;
        table = 'Cover_Individual';
      } else if (issues && issues.length > 0) {
        where.fk_issue = issues[0].id;
        table = 'Issue_Individual';
      } else {
        return [];
      }

      where.fk_individual = individualParent.id;
      const relationModel = models[table] as {
        findAll: (options: { where: Record<string, number> }) => Promise<Array<{ type: string }>>;
      };
      const relation = await relationModel.findAll({ where });
      return relation.map((r) => r.type);
    },
  },
};
