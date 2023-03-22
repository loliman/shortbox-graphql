import Sequelize, {Model} from 'sequelize';

class Story_Individual extends Model {
    static tableName = 'gcd_story_credit';
}

export default (sequelize) => {
    Story_Individual.init({
        creator_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        credit_type_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        story_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        is_credited: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        }
    }, {
        sequelize,
        tableName: Story_Individual.tableName
    });

    return Story_Individual;
};
