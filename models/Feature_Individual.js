import Sequelize, {Model} from 'sequelize';

/*
WRITER
TRANSLATOR
 */
class Feature_Individual extends Model {
    static tableName = 'Feature_Individual';
}

export default (sequelize) => {
    Feature_Individual.init({
        fk_feature: {
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
            fields: ['fk_feature', 'fk_individual', 'type']
        }],
        sequelize,
        tableName: Feature_Individual.tableName
    });

    return Feature_Individual;
};
