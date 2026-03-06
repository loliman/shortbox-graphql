import { DataTypes, Model, Sequelize, Transaction } from 'sequelize';
import type { DbModels } from '../../types/db';
import { Issue } from '../issue/Issue.model';

export class Series extends Model {
  public id!: number;
  public title!: string;
  public startyear!: number;
  public endyear!: number | null;
  public volume!: number;
  public genre!: string;
  public addinfo!: string;
  public fk_publisher!: number;

  public static associate(models: DbModels) {
    Series.hasMany(models.Issue, {
      as: { singular: 'issue', plural: 'issues' },
      foreignKey: 'fk_series',
      onDelete: 'cascade',
    });
    Series.belongsTo(models.Publisher, { as: 'publisher', foreignKey: 'fk_publisher' });
  }

  // Die delete Methode wird später in einen Service verschoben,
  // hier bleibt sie vorerst für die Kompatibilität mit dem bestehenden Code.
  public async deleteInstance(transaction: Transaction, models: DbModels): Promise<void> {
    const issues = await models.Issue.findAll({
      where: { fk_series: this.id },
      transaction,
    });

    for (const issue of issues as Issue[]) {
      await issue.deleteInstance(transaction, models);
    }

    await this.destroy({ transaction });
  }
}

export default (sequelize: Sequelize) => {
  Series.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(255),
      },
      startyear: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      endyear: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      volume: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      genre: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      addinfo: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '',
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ['title', 'volume', 'fk_publisher'],
        },
        {
          fields: ['id'],
        },
        {
          fields: ['title', 'volume'],
        },
      ],
      sequelize,
      tableName: 'series',
    },
  );

  return Series;
};
