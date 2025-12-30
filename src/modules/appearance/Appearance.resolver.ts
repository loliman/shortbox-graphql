import { Sequelize, Op } from 'sequelize';

export const resolvers = {
  Query: {
    apps: async (_: any, { pattern, type, offset }: any, { models }: any) => {
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

      if (type) where.type = { [Op.like]: type.toUpperCase() };

      return await models.Appearance.findAll({
        order: order,
        where: where,
        offset: offset,
        limit: 50,
      });
    },
  },
  Appearance: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    name: (parent: any) => parent.name.trim(),
    type: (parent: any) => (parent.type.trim() === '' ? 'CHARACTER' : parent.type),
    role: async (parent: any, _: any, { models }: any) => {
      if (!parent.Stories || parent.Stories.length === 0) return '';
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
