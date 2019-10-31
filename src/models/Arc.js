import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Arc extends Model {
    static tableName = 'Arc';

    static associate(models) {
        Arc.belongsToMany(models.Issue, {through: models.Issue_Arc, foreignKey: 'fk_arc'});
    }
}

export default (sequelize) => {
    Arc.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
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
            fields: ['title', 'type']
        }],
        sequelize,
        tableName: Arc.tableName
    });

    return Arc;
};

export const typeDef = gql`
    extend type Query {
      arcs(pattern: String, offset: Int): [Arc]  
    }
  
    input ArcInput {
      id: String,
      title: String,
      type: String
    }
      
    type Arc {
      id: ID,
      title: String,
      type: String,
      issues: [Issue]
    }
`;

export const resolvers = {
    Query: {
        arcs: (_, {pattern, offset}) => {
            let where = {};
            if(pattern)
                where.title = {[Sequelize.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%'};

            return models.Arc.findAll({
                where: where,
                order: [['title', 'ASC']],
                offset: offset,
                limit: 50
            })
        }
    },
    Arc: {
        id: (parent) => parent.id,
        title: (parent) => parent.title.trim(),
        type: (parent) => parent.type,
        issues: async (parent) => await models.Issue.findAll({
            include: [{
                model: models.Arc
            }],
            where: {
                '$Issues->Issue_Arc.fk_arc$': parent.id,
                '$Issues->Issue_Arc.type$': parent.type
            }
        })
    }
};

export async function create(arc, issue, transaction) {
    return new Promise(async (resolve, reject) => {
        try {
            models.Arc.findOrCreate({
                where: {
                    title: arc.title,
                    type: arc.type
                },
                transaction: transaction
            }).then(async ([arc, created]) => {
                resolve(await models.Issue_Arc.create({fk_issue: issue.id, fk_arc: arc.id}, {transaction: transaction}));
            });
        } catch (e) {
            reject(e);
        }
    });
}
