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
            allowNull: false
        },
        fk_individual: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        type: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['fk_issue', 'fk_individual', 'type']
        }],
        sequelize,
        tableName: Issue_Individual.tableName
    });

    return Issue_Individual;
};
