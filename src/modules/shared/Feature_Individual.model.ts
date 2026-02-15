import { Model, DataTypes, Sequelize } from 'sequelize';

export class Feature_Individual extends Model {
  public fk_feature!: number;
  public fk_individual!: number;
  public type!: string;
}

export default (sequelize: Sequelize) => {
  Feature_Individual.init(
    {
      fk_feature: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      fk_individual: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'Feature_Individual',
    },
  );

  return Feature_Individual;
};
