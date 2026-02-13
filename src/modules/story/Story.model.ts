import { Model, DataTypes, Sequelize } from 'sequelize';
import type { DbModels } from '../../types/db';

export class Story extends Model {
  public id!: number;
  public title!: string;
  public number!: number;
  public onlyapp!: boolean;
  public firstapp!: boolean;
  public otheronlytb!: boolean;
  public onlytb!: boolean;
  public onlyoneprint!: boolean;
  public collected!: boolean;
  public collectedmultipletimes!: boolean;
  public addinfo!: string;
  public part!: string;
  public fk_issue!: number;
  public fk_parent!: number | null;
  public fk_reprint!: number | null;

  public static associate(models: DbModels) {
    Story.hasMany(models.Story, { as: 'Children', foreignKey: 'fk_parent' });
    Story.hasMany(models.Story, { as: 'Reprints', foreignKey: 'fk_reprint' });
    Story.belongsTo(models.Issue, { foreignKey: 'fk_issue' });
    Story.belongsToMany(models.Individual, {
      through: models.Story_Individual,
      foreignKey: 'fk_story',
    });
    Story.belongsToMany(models.Appearance, {
      through: models.Story_Appearance,
      foreignKey: 'fk_story',
    });
  }
}

export default (sequelize: Sequelize) => {
  Story.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
      number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      onlyapp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      firstapp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      otheronlytb: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      onlytb: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      onlyoneprint: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      collected: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      collectedmultipletimes: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      addinfo: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '',
      },
      part: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: '',
      },
    },
    {
      sequelize,
      tableName: 'Story',
    },
  );

  return Story;
};
