import { DataTypes, Model, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class ChangeRequest extends Model {
  public id!: number;
  public fk_issue!: number;
  public type!: 'SERIES' | 'ISSUE' | 'PUBLISHER';
  public changerequest!: Record<string, unknown>;
  public readonly createdat!: Date;

  public static associate(models: DbModels) {
    ChangeRequest.belongsTo(models.Issue, {
      as: 'issue',
      foreignKey: 'fk_issue',
      onDelete: 'cascade',
    });
  }
}

export default (sequelize: Sequelize) => {
  ChangeRequest.init(
    {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      fk_issue: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      changerequest: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      createdat: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: 'changerequests',
      createdAt: false,
      updatedAt: false,
      indexes: [
        { fields: ['fk_issue'] },
        { fields: ['createdat'] },
        { fields: ['type', 'createdat'] },
      ],
    },
  );

  return ChangeRequest;
};
