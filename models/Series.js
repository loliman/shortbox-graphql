import Sequelize, {Model} from 'sequelize';

class Series extends Model {
    static tableName = 'Series';

    static associate(models) {
        Series.hasMany(models.Issue, {as: 'Issue', foreignKey: 'fk_series'});
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
            type: Sequelize.STRING
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
