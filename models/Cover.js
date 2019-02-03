import Sequelize, {Model} from 'sequelize';

class Cover extends Model {
    static tableName = 'Cover';

    static associate(models) {
        Cover.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Cover.belongsToMany(models.Issue, { as: 'ContainedCovers', through: 'Issue_Cover', foreignKey: 'fk_cover' });
        Cover.belongsToMany(models.Individual, { as: 'Covers', through: 'Cover_Artist', foreignKey: 'fk_cover' });
    }
}

export default (sequelize) => {
    Cover.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        url: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
      /*  indexes: [{
            unique: true,
            fields: ['title']
        }],*/
        sequelize,
        tableName: Cover.tableName
    });

    return Cover;
};
