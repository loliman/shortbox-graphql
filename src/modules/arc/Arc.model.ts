import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Arc extends Model {
  public id!: number;
  public title!: string;
  public type!: string;

  public static associate(models: DbModels) {
    Arc.belongsToMany(models.Issue, {
      as: 'issues',
      through: models.Issue_Arc,
      foreignKey: 'fk_arc',
    });
  }
}

export default (sequelize: Sequelize) => {
  Arc.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      title: {
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
      tableName: 'arc',
      indexes: [
        {
          unique: true,
          fields: ['title', 'type'],
        },
      ],
    },
  );

  return Arc;
};
