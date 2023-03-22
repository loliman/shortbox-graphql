import Sequelize, {Model} from 'sequelize';

class IndividualType extends Model {
    static tableName = 'gcd_credit_type';

    static associate(models) {
        IndividualType.belongsToMany(models.Story, {through: models.Story_Individual, foreignKey: 'story_id'});
        IndividualType.belongsToMany(models.Individual, {through: models.Story_Individual, foreignKey: 'creator_id'});
    }
}

export default (sequelize) => {
    IndividualType.init({
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
        tableName: IndividualType.tableName
    });

    return IndividualType;
};