import Sequelize, {Model} from 'sequelize';

class Issue_Arc extends Model {
    static tableName = 'Issue_Arc';
}

export default (sequelize) => {
    Issue_Arc.init({
        fk_issue: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        fk_arc: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        }
    }, {
        sequelize,
        tableName: Issue_Arc.tableName
    });

    return Issue_Arc;
};
