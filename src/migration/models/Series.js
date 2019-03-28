import Sequelize, {Model} from 'sequelize';

class Series extends Model {
    static tableName = 'Series';

    static associate(models) {
        Series.hasMany(models.Issue, {foreignKey: 'fk_series', onDelete: 'cascade'});

        Series.belongsTo(models.Publisher, {foreignKey: 'fk_publisher'})
    }
}

export default (sequelize) => {
    Series.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        title: {
            type: Sequelize.STRING(255)
        },
        startyear: {
            type: Sequelize.INTEGER
        },
        endyear: {
            type: Sequelize.INTEGER
        },
        volume: {
            type: Sequelize.INTEGER
        },
        original: {
            type: Sequelize.INTEGER
        }
    }, {
        sequelize,
        tableName: Series.tableName
    });

    return Series;
};