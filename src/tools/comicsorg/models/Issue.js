import Sequelize, {Model} from 'sequelize';

class Issue extends Model {
    static tableName = 'gcd_issue';

    static associate(models) {
        Issue.hasMany(models.Story, {
            as: {singular: 'Issue', plural: 'Stories'},
            foreignKey: 'issue_id',
            onDelete: 'cascade'
        });
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
    }, {
        indexes: [{
            fields: ['id']
        }],
        sequelize,
        tableName: Issue.tableName
    });

    return Issue;
};