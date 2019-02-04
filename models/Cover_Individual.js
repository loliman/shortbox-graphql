import Sequelize, {Model} from 'sequelize';

/*
ARTIST
*/
class Cover_Individual extends Model {
    static tableName = 'Cover_Individual';
}

export default (sequelize) => {
    Cover_Individual.init({
        fk_cover: {
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
            fields: ['fk_cover', 'fk_individual', 'type']
        }],
        sequelize,
        tableName: Cover_Individual.tableName
    });

    return Cover_Individual;
};
