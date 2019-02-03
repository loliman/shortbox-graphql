import Sequelize, {Model} from 'sequelize';

/*
PENCILER
INKER
WRITER
COLOURIST
LETTER
EDITOR
TRANSLATOR
*/
class Story_Individual extends Model {
    static tableName = 'Story_Individual';
}

export default (sequelize) => {
    Story_Individual.init({
        fk_story: {
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
            fields: ['fk_story', 'fk_individual', 'type']
        }],
        sequelize,
        tableName: Story_Individual.tableName
    });

    return Story_Individual;
};
