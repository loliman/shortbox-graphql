import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Appearance extends Model {
  public id!: number;
  public name!: string;
  public type!: string;

  public static associate(models: DbModels) {
    Appearance.belongsToMany(models.Story, {
      through: models.Story_Appearance,
      foreignKey: 'fk_appearance',
    });
  }
}

export default (sequelize: Sequelize) => {
  Appearance.init(
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
      type: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'Appearance',
      indexes: [
        {
          unique: true,
          fields: ['name', 'type'],
        },
      ],
    },
  );

  return Appearance;
};
