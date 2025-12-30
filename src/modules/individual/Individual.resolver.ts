import { Sequelize, Op } from 'sequelize';

export const resolvers = {
  Query: {
    individuals: (_: any, { pattern, offset }: any, { models }: any) => {
      let where: any = {};
      let order: any = [['name', 'ASC']];

      if (pattern && pattern !== '') {
        where.name = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
        order = [
          [
            Sequelize.literal(
              'CASE ' +
                "   WHEN name LIKE '" +
                pattern +
                "' THEN 1 " +
                "   WHEN name LIKE '" +
                pattern +
                "%' THEN 2 " +
                "   WHEN name LIKE '%" +
                pattern +
                "' THEN 4 " +
                '   ELSE 3 ' +
                'END',
            ),
            'ASC',
          ],
        ];
      }

      return models.Individual.findAll({
        where: where,
        order: order,
        offset: offset,
        limit: 50,
      });
    },
  },
  Individual: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    name: (parent: any) => parent.name,
    type: async (parent: any, _: any, { models }: any) => {
      let where: any = {};
      let table = '';

      if (parent.Stories && parent.Stories.length > 0) {
        where.fk_story = parent.Stories[0].id;
        table = 'Story_Individual';
      } else if (parent.Covers && parent.Covers.length > 0) {
        where.fk_cover = parent.Covers[0].id;
        table = 'Cover_Individual';
      } else if (parent.Issues && parent.Issues.length > 0) {
        where.fk_issue = parent.Issues[0].id;
        table = 'Issue_Individual';
      } else if (parent.Features && parent.Features.length > 0) {
        where.fk_feature = parent.Features[0].id;
        table = 'Feature_Individual';
      } else {
        return [];
      }

      where.fk_individual = parent.id;
      let relation = await models[table].findAll({ where });
      return relation.map((r: any) => r.type);
    },
  },
};
