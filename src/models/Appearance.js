import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Appearance extends Model {
    static tableName = 'Appearance';

    static associate(models) {
        Appearance.belongsToMany(models.Story, {through: models.Story_Appearance, foreignKey: 'fk_appearance'});
    }
}

export default (sequelize) => {
    Appearance.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        type: {
            type: Sequelize.STRING(255),
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name', 'type']
        }],
        sequelize,
        tableName: Appearance.tableName
    });

    return Appearance;
};

export const typeDef = gql`
    extend type Query {
      apps(pattern: String, type: String, offset: Int): [Appearance]  
    }
    
    input AppearanceInput {
      id: String,
      name: String,
      type: String,
      role: String
    }
    
    type Appearance {
      id: ID,
      name: String,
      type: String,
      role: String
    }
`;

export const resolvers = {
    Query: {
        apps: async (_, {pattern, type, offset}) => {
            let where = {};
            let order = [['name', 'ASC']];

            if (pattern !== '') {
                where.name = {[Sequelize.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%'};
                order = [[models.sequelize.literal("CASE " +
                    "   WHEN name LIKE '" + pattern + "' THEN 1 " +
                    "   WHEN name LIKE '" + pattern + "%' THEN 2 " +
                    "   WHEN name LIKE '%" + pattern + "' THEN 4 " +
                    "   ELSE 3 " +
                    "END"), 'ASC']];
            }

            if (type)
                where.type = {[Sequelize.Op.like]: type.toUpperCase()};

            return await models.Appearance.findAll({
                order: order,
                where: where,
                offset: offset,
                limit: 50
            });
        }
    },
    Appearance: {
        id: (parent, _, context) => {
            const {loggedIn} = context;
            if (!loggedIn)
                return null;

            return parent.id;
        },
        name: (parent) => parent.name.trim(),
        type: (parent) => (parent.type.trim() === '' ? 'CHARACTER' : parent.type),
        role: async (parent) => {
            let relation = await models.Story_Appearance.findAll({
                where: {
                    fk_story: parent.Stories[0].id,
                    fk_appearance: parent.id
                }
            });

            return relation[0].role;
        }
    }
};
