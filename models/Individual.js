import Sequelize, {Model} from 'sequelize';

class Individual extends Model {
    static tableName = 'Individual';

    static associate(models) {
        Individual.hasMany(models.Issue, {as: 'Issues', foreignKey: 'fk_editor'});

        Individual.belongsToMany(models.Cover, { as: 'Artists', through: 'Cover_Artist', foreignKey: 'fk_artist' });
        Individual.belongsToMany(models.Feature, { through: models.Feature_Individual, foreignKey: 'fk_individual' });
        Individual.belongsToMany(models.Story, { through: models.Story_Individual, foreignKey: 'fk_individual' });
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
            type: Sequelize.STRING,
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
