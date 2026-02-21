import { Model, DataTypes, Sequelize } from 'sequelize';

export class Issue_Individual extends Model {
  public fk_issue!: number;
  public fk_individual!: number;
  public type!: string;
}

export default (sequelize: Sequelize) => {
  Issue_Individual.init(
    {
      fk_issue: {
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
      tableName: 'issue_individual',
      modelName: 'issue_individual',
    },
  );

  return Issue_Individual;
};
