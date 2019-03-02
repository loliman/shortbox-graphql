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
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        original: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }],
        sequelize,
        tableName: Publisher.tableName
    });

    return Publisher;
};
