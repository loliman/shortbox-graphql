import Sequelize, {Model} from 'sequelize';

class Story extends Model {
    static tableName = 'gcd_story';

    static associate(models) {
        Story.belongsTo(models.Issue, {foreignKey: 'issue_id'});

        Story.hasOne(models.StoryType, {
            foreignKey: 'type_id',
            onDelete: 'cascade'
        });

        Story.belongsToMany(models.Individual, {
            through: models.Story_Individual,
            foreignKey: 'creator_id',
            unique: false
        });

        Story.belongsToMany(models.IndividualType, {
            through: models.Story_Individual,
            foreignKey: 'credit_type_id',
            unique: false
        });
    }
}

export default (sequelize) => {
    Story.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        script: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        pencils: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        inks: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        colors: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        letters: {
            type: Sequelize.STRING(255),
            allowNull: false,
            default: ''
        },
        sequence_number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['issue_id', 'sequence_number']
        }],
        sequelize,
        tableName: Story.tableName
    });

    return Story;
};
