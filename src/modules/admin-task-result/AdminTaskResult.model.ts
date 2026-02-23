import { DataTypes, Model, Sequelize } from 'sequelize';

export class AdminTaskResult extends Model {
  public id!: number;
  public job_id!: string;
  public task_identifier!: string;
  public result_json!: string;
  public created_at!: Date;
}

export default (sequelize: Sequelize) => {
  AdminTaskResult.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      job_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      task_identifier: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      result_json: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'admin_task_result',
      timestamps: false,
      indexes: [
        { fields: ['task_identifier', 'created_at'] },
        { unique: true, fields: ['job_id'] },
      ],
    },
  );

  return AdminTaskResult;
};
