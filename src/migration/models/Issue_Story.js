import Sequelize, {Model} from 'sequelize';

class Issue_Story extends Model {
    static tableName = 'Issue_Story';
}

export default (sequelize) => {
    Issue_Story.init({
        fk_issue: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        fk_story: {
            type: Sequelize.INTEGER,
            primaryKey: true
        }
    }, {
        sequelize,
        tableName: Issue_Story.tableName
    });

    return Issue_Story;
};
