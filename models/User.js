import Sequelize, {Model} from 'sequelize';

class User extends Model {
    static tableName = 'User';
}

export default (sequelize) => {
    User.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING,
            allowNull: false
        },
        password: {
            type: Sequelize.STRING,
            allowNull: false
        },
        sessionid: {
            type: Sequelize.STRING,
            allowNull: true
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }],
        sequelize,
        tableName: User.tableName
    });

    return User;
};
