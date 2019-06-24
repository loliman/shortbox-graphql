import Sequelize, {Model} from 'sequelize';

class Story_Appearance extends Model {
    static tableName = 'Story_Appearance';
}

export default (sequelize) => {
    Story_Appearance.init({
        fk_appearance: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        fk_story: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        role: {
            type: Sequelize.STRING,
            primaryKey: true,
            allowNull: false
        }
    }, {
        sequelize,
        tableName: Story_Appearance.tableName
    });

    return Story_Appearance;
};
