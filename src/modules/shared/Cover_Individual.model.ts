import { Model, DataTypes, Sequelize } from 'sequelize';

export class Cover_Individual extends Model {
  public fk_cover!: number;
  public fk_individual!: number;
  public type!: string;
}

export default (sequelize: Sequelize) => {
  Cover_Individual.init(
    {
      fk_cover: {
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
      tableName: 'Cover_Individual',
    },
  );

  return Cover_Individual;
};
