import Sequelize, {Model} from 'sequelize';

class Individual extends Model {
    static tableName = 'gcd_creator';

    static associate(models) {
        Individual.belongsToMany(models.Story, {through: models.Story_Individual, foreignKey: 'creator_id'});
        Individual.belongsToMany(models.IndividualType, {
            through: models.Story_Individual,
            foreignKey: 'credit_type_id'
        });
    }
}

export default (sequelize) => {
    Individual.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        gcd_official_name: {
            type: Sequelize.STRING(255),
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }],
        sequelize,
        tableName: Individual.tableName
    });

    return Individual;
};