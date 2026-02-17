import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Publisher extends Model {
  public id!: number;
  public name!: string;
  public original!: boolean;
  public addinfo!: string;
  public startyear!: number;
  public endyear!: number | null;

  public static associate(models: DbModels) {
    Publisher.hasMany(models.Series, {
      as: 'Series',
      foreignKey: 'fk_publisher',
      onDelete: 'cascade',
    });
  }
}

export default (sequelize: Sequelize) => {
  Publisher.init(
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
      original: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      addinfo: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '',
      },
      startyear: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      endyear: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ['name'],
        },
        {
          fields: ['id'],
        },
      ],
      sequelize,
      tableName: 'publisher',
    },
  );

  return Publisher;
};
