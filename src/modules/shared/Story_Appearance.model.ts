import { Model, DataTypes, Sequelize } from 'sequelize';

export class Story_Appearance extends Model {
  public fk_appearance!: number;
  public fk_story!: number;
  public role!: string;
}

export default (sequelize: Sequelize) => {
  Story_Appearance.init(
    {
      fk_appearance: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      fk_story: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'Story_Appearance',
    },
  );

  return Story_Appearance;
};
