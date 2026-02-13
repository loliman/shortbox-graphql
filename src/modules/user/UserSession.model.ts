import { DataTypes, Model, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class UserSession extends Model {
  public id!: number;
  public fk_user!: number;
  public tokenhash!: string;
  public csrftokenhash!: string | null;
  public expiresat!: Date;
  public revokedat!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate(models: DbModels) {
    UserSession.belongsTo(models.User, {
      foreignKey: 'fk_user',
      onDelete: 'cascade',
    });
  }
}

export default (sequelize: Sequelize) => {
  UserSession.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      fk_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id',
        },
      },
      tokenhash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      csrftokenhash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      expiresat: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedat: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'UserSession',
      indexes: [
        { unique: true, fields: ['tokenhash'] },
        { fields: ['csrftokenhash'] },
        { fields: ['fk_user'] },
        { fields: ['expiresat'] },
        { fields: ['revokedat'] },
      ],
    },
  );

  return UserSession;
};
