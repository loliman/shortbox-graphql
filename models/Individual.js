import Sequelize, {Model} from 'sequelize';

class Individual extends Model {
    static tableName = 'Individual';

    static associate(models) {
        Individual.belongsToMany(models.Cover, {through: models.Cover_Individual, foreignKey: 'fk_individual'});
        Individual.belongsToMany(models.Feature, { through: models.Feature_Individual, foreignKey: 'fk_individual' });
        Individual.belongsToMany(models.Story, { through: models.Story_Individual, foreignKey: 'fk_individual' });
        Individual.belongsToMany(models.Issue, {through: models.Issue_Individual, foreignKey: 'fk_individual'});
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
        tableName: Individual.tableName
    });

    return Individual;
};
