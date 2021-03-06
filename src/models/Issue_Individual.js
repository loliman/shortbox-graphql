import Sequelize, {Model} from 'sequelize';

/*
ARTIST
*/
class Issue_Individual extends Model {
    static tableName = 'Issue_Individual';
}

export default (sequelize) => {
    Issue_Individual.init({
        fk_issue: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        fk_individual: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        type: {
            type: Sequelize.STRING,
            primaryKey: true,
            allowNull: false
        }
    }, {
        sequelize,
        tableName: Issue_Individual.tableName
    });

    return Issue_Individual;
};
