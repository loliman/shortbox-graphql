import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Feature extends Model {
  public id!: number;
  public title!: string;
  public number!: number;
  public addinfo!: string;
  public fk_issue!: number;

  public static associate(models: DbModels) {
    Feature.belongsTo(models.Issue, { foreignKey: 'fk_issue' });
    Feature.belongsToMany(models.Individual, {
      through: models.Feature_Individual,
      foreignKey: 'fk_feature',
    });
  }
}

export default (sequelize: Sequelize) => {
  Feature.init(
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
      number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      addinfo: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'feature',
      indexes: [
        {
          unique: true,
          fields: ['title', 'fk_issue', 'number'],
        },
      ],
    },
  );

  return Feature;
};
