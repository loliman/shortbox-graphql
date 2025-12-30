import { Sequelize, Op } from 'sequelize';

export const resolvers = {
  Query: {
    arcs: (_: any, { pattern, type, offset }: any, { models }: any) => {
      let where: any = {};
      let order: any = [['title', 'ASC']];

      if (pattern && pattern !== '') {
        where.title = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
        order = [
          [
            Sequelize.literal(
              'CASE ' +
                "   WHEN title LIKE '" +
                pattern +
                "' THEN 1 " +
                "   WHEN title LIKE '" +
                pattern +
                "%' THEN 2 " +
                "   WHEN title LIKE '%" +
                pattern +
                "' THEN 4 " +
                '   ELSE 3 ' +
                'END',
            ),
            'ASC',
          ],
        ];
      }

      if (type) where.type = { [Op.eq]: type.toUpperCase() };

      return models.Arc.findAll({
        where: where,
        order: order,
        offset: offset,
        limit: 50,
      });
    },
  },
  Arc: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    title: (parent: any) => parent.title.trim(),
    issues: async (parent: any, _: any, { models }: any) =>
      await models.Issue.findAll({
        include: [
          {
            model: models.Arc,
            where: { id: parent.id },
          },
        ],
      }),
  },
};
