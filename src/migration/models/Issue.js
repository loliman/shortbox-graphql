import Sequelize, {Model} from 'sequelize';

class Issue extends Model {
    static tableName = 'Issue';

    static associate(models) {
        Issue.belongsTo(models.Series, {foreignKey: 'fk_series'});
        Issue.belongsToMany(models.Story, {through: models.Issue_Story, foreignKey: 'fk_issue'});
    }
}

export default (sequelize) => {
    Issue.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        title: {
            type: Sequelize.STRING(255)
        },
        number: {
            type: Sequelize.STRING(255)
        },
        format: {
            type: Sequelize.STRING(255)
        },
        variant: {
            type: Sequelize.STRING(255)
        },
        pages: {
            type: Sequelize.INTEGER
        },
        releasedate: {
            type: Sequelize.DATE
        },
        price: {
            type: Sequelize.FLOAT
        },
        currency: {
            type: Sequelize.STRING
        },
        originalissue: {
            type: Sequelize.INTEGER
        }
    }, {
        sequelize,
        tableName: Issue.tableName
    });

    return Issue;
};