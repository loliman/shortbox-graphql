import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class Cover extends Model {
    static tableName = 'Cover';

    static associate(models) {
        Cover.hasMany(models.Cover, {as: {singular: 'Children', plural: 'Parent'}, foreignKey: 'fk_parent'});

        Cover.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Cover.belongsToMany(models.Individual, {through: models.Cover_Individual, foreignKey: 'fk_cover'});
    }

    async associateIndividual(name, type) {
        return new Promise(async (resolve, reject) => {
            try {
                models.Individual.findOrCreate({
                    where: {
                        name: name
                    }
                }).then(async ([individual, created]) => {
                    resolve(await models.Cover_Individual.create({fk_cover: this.id, fk_individual: individual.id, type: type}));
                });
            } catch (e) {
                reject(e);
            }
        });
    }
}

export default (sequelize) => {
    Cover.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        url: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        },
        /*Front means 0*/
        number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: ''
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['fk_parent', 'fk_issue', 'number']
        }],
        sequelize,
        tableName: Cover.tableName
    });

    return Cover;
};

export const typeDef = gql`
 input CoverInput {
    number: Int!,
    parent: CoverInput,
    issue: IssueInput,
    artist: IndividualInput,
    addinfo: String,
    exclusive: Boolean
  }
  
  type Cover {
    id: ID,
    url: String,
    number: Int,
    addinfo: String,
    parent: Cover,
    children: [Cover],
    onlyapp: Boolean,
    firstapp: Boolean,
    exclusive: Boolean,
    issue: Issue,
    artists: [Individual]
  }
`;

export const resolvers = {
    Cover: {
        id: (parent) => parent.id,
        url: (parent) => parent.url,
        number: (parent) => parent.number,
        parent: async (parent) => await models.Cover.findById(parent.fk_parent),
        issue: async (parent) => await models.Issue.findById(parent.fk_issue),
        children: async (parent) => await models.Cover.findAll({
            where: {fk_parent: parent.id},
            include: [models.Issue],
            group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
            order: [[models.Issue, 'releasedate', 'ASC']]
        }),
        onlyapp: async (parent) => {
            let covers = await models.Cover.findAll({
                where: {fk_parent: parent.fk_parent},
                include: [models.Issue],
                group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
                order: [[models.Issue, 'releasedate', 'ASC'], [models.Issue, 'variant', 'ASC']]
            });

            return covers.length === 1;
        },
        firstapp: async (parent) => {
            let cover = await models.Cover.findAll({
                where: {fk_parent: parent.fk_parent},
                include: [models.Issue],
                group: [[models.Issue, 'fk_series'], [models.Issue, 'number']],
                order: [[models.Issue, 'releasedate', 'ASC'], [models.Issue, 'variant', 'ASC']]
            });

            let firstapp = false;
            if(cover.length > 0) {
                if(cover[0]['Issue'].id === parent.fk_issue)
                    firstapp = true;
                else {
                    let issue = await models.Issue.findOne({
                        where: {id: parent.fk_issue}
                    });

                    if(issue.number === cover[0]['Issue'].number && issue.fk_series === cover[0]['Issue'].fk_series)
                        firstapp = true;
                }
            }

            return firstapp;
        },
        exclusive: async (parent) => {
            return parent.fk_parent === null;
        },
        addinfo: (parent) => parent.addinfo,
        artists: async (parent) => await models.Individual.findAll({
            include: [{
                model: models.Cover
            }],
            where: {
                '$Covers->Cover_Individual.fk_cover$': parent.id,
                '$Covers->Cover_Individual.type$': 'ARTIST'
            }
        })
    }
};

export async function create(cover, issue, coverUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            if (cover.exclusive) {
                let resCover = await models.Cover.create({
                    number: cover.number,
                    url: cover.number === 0 ? coverUrl : '',
                    addinfo: cover.addinfo,
                    fk_issue: issue.id
                });

                if (cover.artist.name.trim() !== '')
                    await resCover.associateIndividual(cover.artist.name.trim(), 'ARTIST');

                await resCover.save();
            } else {
                let resIssue = await findOrCrawlIssue(cover.parent.issue);

                let oVariants = await models.Issue.findAll({
                    where: {
                        fk_series: resIssue.fk_series,
                        number: resIssue.number
                    },
                    order: [['number', 'ASC']]
                });
                let oVariant;

                oVariants.forEach(e => {
                    if (e.variant === cover.parent.issue.variant)
                        oVariant = e;
                });

                if (!oVariant)
                    throw new Error();

                let oCover = await models.Cover.findOne({where: {fk_issue: oVariant.id}});
                let newCover = await models.Cover.create({
                    url: cover.number === 0 ? coverUrl : '',
                    number: cover.number,
                    addinfo: cover.addinfo,
                    fk_parent: oCover.id
                });

                await newCover.setIssue(issue);
                await newCover.save();
            }

            resolve(cover);
        } catch (e) {
            reject(e);
        }
    });
}