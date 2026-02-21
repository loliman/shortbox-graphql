import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Individual extends Model {
  public id!: number;
  public name!: string;

  public static associate(models: DbModels) {
    Individual.belongsToMany(models.Cover, {
      as: 'covers',
      through: models.Cover_Individual,
      foreignKey: 'fk_individual',
    });
    Individual.belongsToMany(models.Story, {
      as: 'stories',
      through: models.Story_Individual,
      foreignKey: 'fk_individual',
    });
    Individual.belongsToMany(models.Issue, {
      as: 'issues',
      through: models.Issue_Individual,
      foreignKey: 'fk_individual',
    });
  }
}

export default (sequelize: Sequelize) => {
  Individual.init(
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
    },
    {
      sequelize,
      tableName: 'individual',
      indexes: [
        {
          unique: true,
          fields: ['name'],
        },
      ],
    },
  );

  return Individual;
};
