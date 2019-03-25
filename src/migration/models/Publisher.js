import Sequelize, {Model} from 'sequelize';

class Publisher extends Model {
    static tableName = 'Publisher';

    static associate(models) {
        Publisher.hasMany(models.Series, {as: 'Series', foreignKey: 'fk_publisher', onDelete: 'cascade'});
    }
}

export default (sequelize) => {
    Publisher.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        name: {
            type: Sequelize.STRING(255)
        }
    }, {
        sequelize,
        tableName: Publisher.tableName
    });

    return Publisher;
};
