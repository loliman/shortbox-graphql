import Sequelize, {Model} from 'sequelize';

class Issue extends Model {
    static tableName = 'Issue';

    static associate(models) {
        Issue.hasMany(models.Issue, {as: 'Variants', foreignKey: 'fk_variant', onDelete: 'cascade'});
        Issue.hasMany(models.Story, {as: {singular: 'Issue', plural: 'Stories'}, foreignKey: 'fk_issue', onDelete: 'cascade'});
        Issue.hasMany(models.Cover, {foreignKey: 'fk_issue', onDelete: 'cascade'});

        Issue.belongsTo(models.Series, {foreignKey: 'fk_series'});
        Issue.belongsToMany(models.Individual, { through: models.Issue_Individual, foreignKey: 'fk_issue' });
    }
}

export default (sequelize) => {
    Issue.init({
        id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(125),
            allowNull: false
        },
        number: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        format: {
            type: Sequelize.STRING(125),
            allowNull: false
        },
        limitation: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        variant: {
            type: Sequelize.STRING(125),
            allowNull: true
        },
        releasedate: {
            type: Sequelize.DATE,
            allowNull: true
        },
        pages: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        price: {
            type: Sequelize.FLOAT,
            allowNull: true
        },
        currency: {
            type: Sequelize.STRING,
            allowNull: true
        },
        language: {
            type: Sequelize.STRING,
            allowNull: false
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false
        },
        verified: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['number', 'fk_series', 'format', 'variant']
        }],
        sequelize,
        tableName: Issue.tableName
    });

    return Issue;
};
