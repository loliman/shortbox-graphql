import { Sequelize, Op } from 'sequelize';
import { IndividualResolvers } from '../../types/graphql';
import { buildConnectionFromNodes, decodeCursorId } from '../../core/cursor';

type IndividualParent = {
  id: number;
  name: string;
  Stories?: Array<{ id: number }>;
  Covers?: Array<{ id: number }>;
  Issues?: Array<{ id: number }>;
  Features?: Array<{ id: number }>;
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
        where[Op.and] = [
          Sequelize.literal(
            `(name, id) > (SELECT name, id FROM Individual WHERE id = ${decodedCursor})`,
          ),
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
      const where: Record<string, number> = {};
      let table:
        | 'Story_Individual'
        | 'Cover_Individual'
        | 'Issue_Individual'
        | 'Feature_Individual'
        | '' = '';
      const individualParent = parent as IndividualParent;

      if (individualParent.Stories && individualParent.Stories.length > 0) {
        where.fk_story = individualParent.Stories[0].id;
        table = 'Story_Individual';
      } else if (individualParent.Covers && individualParent.Covers.length > 0) {
        where.fk_cover = individualParent.Covers[0].id;
        table = 'Cover_Individual';
      } else if (individualParent.Issues && individualParent.Issues.length > 0) {
        where.fk_issue = individualParent.Issues[0].id;
        table = 'Issue_Individual';
      } else if (individualParent.Features && individualParent.Features.length > 0) {
        where.fk_feature = individualParent.Features[0].id;
        table = 'Feature_Individual';
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
