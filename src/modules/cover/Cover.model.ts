import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Cover extends Model {
  public id!: number;
  public url!: string;
  public number!: number;
  public addinfo!: string;
  public fk_issue!: number;
  public fk_parent!: number | null;

  public static associate(models: DbModels) {
    Cover.hasMany(models.Cover, { as: 'Children', foreignKey: 'fk_parent' });
    Cover.belongsTo(models.Issue, { foreignKey: 'fk_issue' });
    Cover.belongsToMany(models.Individual, {
      through: models.Cover_Individual,
      foreignKey: 'fk_cover',
    });
  }
}

export default (sequelize: Sequelize) => {
  Cover.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: '',
      },
      number: {
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
      sequelize,
      tableName: 'cover',
      indexes: [
        {
          unique: true,
          fields: ['fk_parent', 'fk_issue', 'number'],
        },
      ],
    },
  );

  return Cover;
};
