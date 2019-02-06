import Sequelize, {Model} from 'sequelize';

class Cover extends Model {
    static tableName = 'Cover';

    static associate(models) {
        Cover.hasMany(models.Cover, {as: {singular: 'Children', plural: 'Parent'}, foreignKey: 'fk_parent'});

        Cover.belongsTo(models.Issue, {foreignKey: 'fk_issue'});
        Cover.belongsToMany(models.Individual, { as: 'Covers', through: models.Cover_Individual, foreignKey: 'fk_cover' });
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
        },
        /*Front means 0*/
        number: {
            type: Sequelize.INTEGER,
            allowNull: false,
        },
        addinfo: {
            type: Sequelize.STRING,
            allowNull: false
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['fk_parent', 'fk_issue', 'number']
        }],
        sequelize,
        tableName: Cover.tableName
    });

    return Cover;
};
