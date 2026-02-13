import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class User extends Model {
  public id!: number;
  public name!: string;
  public password!: string;
  public sessionid!: string | null;

  public static associate(models: DbModels) {
    User.hasMany(models.UserSession, {
      foreignKey: 'fk_user',
      onDelete: 'cascade',
    });
  }
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
      sessionid: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'User',
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
