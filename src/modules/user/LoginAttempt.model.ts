import { DataTypes, Model, Sequelize } from 'sequelize';

export class LoginAttempt extends Model {
  public id!: number;
  public scope!: string;
  public failures!: number;
  public windowstartat!: Date;
  public lockeduntilat!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

export default (sequelize: Sequelize) => {
  LoginAttempt.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      scope: {
        type: DataTypes.STRING(512),
        allowNull: false,
        unique: true,
      },
      failures: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      windowstartat: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      lockeduntilat: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'LoginAttempt',
      indexes: [
        { unique: true, fields: ['scope'] },
        { fields: ['lockeduntilat'] },
      ],
    },
  );

  return LoginAttempt;
};
