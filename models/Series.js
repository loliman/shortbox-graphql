import Sequelize, {Model} from 'sequelize';

class Series extends Model {
    static tableName = 'Series';

    static associate(models) {
        Series.hasMany(models.Issue, {as: 'Issue', foreignKey: 'fk_series', onDelete: 'cascade'});

        Series.belongsTo(models.Publisher, {foreignKey: 'fk_publisher'})
    }
}

export default (sequelize) => {
    Series.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        title: {
            type: Sequelize.STRING(255)
        },
        startyear: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        endyear: {
            type: Sequelize.INTEGER,
            allowNull: true
        },
        volume: {
            type: Sequelize.INTEGER,
            allowNull: false
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['title', 'volume', 'fk_publisher']
        }],
        sequelize,
        tableName: Series.tableName
    });

    return Series;
};
