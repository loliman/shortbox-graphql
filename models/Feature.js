import Sequelize, {Model} from 'sequelize';

class Feature extends Model {
    static tableName = 'Feature';

    static associate(models) {
        Feature.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Feature.belongsToMany(models.Individual, { as: 'Features', through: models.Feature_Individual, foreignKey: 'fk_feature' });
    }
}

export default (sequelize) => {
    Feature.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING,
            allowNull: false
        },
        number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['title', 'fk_issue', 'number']
        }],
        sequelize,
        tableName: Feature.tableName
    });

    return Feature;
};
