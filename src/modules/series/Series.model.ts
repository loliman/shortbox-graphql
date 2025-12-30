import { Model, DataTypes, Sequelize } from 'sequelize';

export class Series extends Model {
  public id!: number;
  public title!: string;
  public startyear!: number;
  public endyear!: number | null;
  public volume!: number;
  public addinfo!: string;
  public fk_publisher!: number;

  public static associate(models: any) {
    Series.hasMany(models.Issue, { as: 'Issue', foreignKey: 'fk_series', onDelete: 'cascade' });
    Series.belongsTo(models.Publisher, { foreignKey: 'fk_publisher' });
  }

  // Die delete Methode wird später in einen Service verschoben,
  // hier bleibt sie vorerst für die Kompatibilität mit dem bestehenden Code.
  public async deleteInstance(transaction: any, models: any): Promise<void> {
    const issues = await models.Issue.findAll({
      where: { fk_series: this.id },
      transaction,
    });

    for (const issue of issues) {
      await issue.delete(transaction);
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
      tableName: 'Series',
    },
  );

  return Series;
};
