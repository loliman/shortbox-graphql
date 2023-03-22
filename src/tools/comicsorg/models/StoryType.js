import Sequelize, {Model} from 'sequelize';

class StoryType extends Model {
    static tableName = 'gcd_story_type';

    static associate(models) {
        StoryType.hasMany(models.Story, {
            as: {singular: 'Type', plural: 'Stories'},
            foreignKey: 'type_id',
            onDelete: 'cascade'
        });
    }
}

export default (sequelize) => {
    StoryType.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }],
        sequelize,
        tableName: StoryType.tableName
    });

    return StoryType;
};