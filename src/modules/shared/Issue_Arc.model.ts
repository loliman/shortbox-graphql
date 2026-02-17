import { Model, DataTypes, Sequelize } from 'sequelize';

export class Issue_Arc extends Model {
  public fk_issue!: number;
  public fk_arc!: number;
}

export default (sequelize: Sequelize) => {
  Issue_Arc.init(
    {
      fk_issue: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      fk_arc: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'issue_arc',
    },
  );

  return Issue_Arc;
};
