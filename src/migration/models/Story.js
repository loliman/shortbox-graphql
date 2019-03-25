import Sequelize, {Model} from 'sequelize';

class Story extends Model {
    static tableName = 'Story';

    static associate(models) {
        Story.belongsToMany(models.Issue, {through: models.Issue_Story, foreignKey: 'fk_story', unique: false});
    }
}

export default (sequelize) => {
    Story.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        title: {
            type: Sequelize.STRING(255)
        },
        number: {
            type: Sequelize.INTEGER
        },
        additionalInfo: {
            type: Sequelize.STRING(255)
        }
    }, {
        sequelize,
        tableName: Story.tableName
    });

    return Story;
};