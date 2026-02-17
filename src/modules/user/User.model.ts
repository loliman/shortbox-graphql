import { Model, DataTypes, Sequelize } from 'sequelize';

export class User extends Model {
  public id!: number;
  public name!: string;
  public password!: string;
}

export default (sequelize: Sequelize) => {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'user',
      indexes: [
        {
          unique: true,
          fields: ['name'],
        },
      ],
    },
  );

  return User;
};
