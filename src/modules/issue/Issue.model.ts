import { DataTypes, Model, Sequelize, Transaction } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Issue extends Model {
  public id!: number;
  public title!: string;
  public number!: string;
  public format!: string;
  public variant!: string;
  public releasedate!: string;
  public pages!: number;
  public price!: number;
  public currency!: string;
  public verified!: boolean;
  public collected!: boolean;
  public comicguideid!: string;
  public isbn!: string;
  public limitation!: string;
  public addinfo!: string;
  public fk_series!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public static associate(models: DbModels) {
    Issue.hasMany(models.Story, {
      as: { singular: 'Issue', plural: 'Stories' },
      foreignKey: 'fk_issue',
      onDelete: 'cascade',
    });
    Issue.hasMany(models.Cover, { foreignKey: 'fk_issue', onDelete: 'cascade' });
    Issue.belongsTo(models.Series, { foreignKey: 'fk_series' });
    Issue.belongsToMany(models.Individual, {
      through: models.Issue_Individual,
      foreignKey: 'fk_issue',
    });
    Issue.belongsToMany(models.Arc, { through: models.Issue_Arc, foreignKey: 'fk_issue' });
  }

  public async deleteInstance(transaction: Transaction, models: DbModels): Promise<void> {
    // Kaskadiertes DB-Cleanup für abhängige Entitäten.
    await models.Story.destroy({ where: { fk_issue: this.id }, transaction });
    await models.Feature.destroy({ where: { fk_issue: this.id }, transaction });
    await models.Cover.destroy({ where: { fk_issue: this.id }, transaction });

    await this.destroy({ transaction });
  }
}

export default (sequelize: Sequelize) => {
  Issue.init(
    {
      id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      number: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      format: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      variant: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      releasedate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      pages: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      collected: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      comicguideid: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '0',
      },
      isbn: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      limitation: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      addinfo: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ['number', 'variant', 'fk_series'],
        },
        {
          fields: ['id'],
        },
        {
          fields: ['number'],
        },
      ],
      sequelize,
      tableName: 'Issue',
    },
  );

  return Issue;
};
