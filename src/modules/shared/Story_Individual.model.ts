import { Model, DataTypes, Sequelize } from 'sequelize';

export class Story_Individual extends Model {
  public fk_story!: number;
  public fk_individual!: number;
  public type!: string;
}

export default (sequelize: Sequelize) => {
  Story_Individual.init(
    {
      fk_story: {
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
      tableName: 'story_individual',
    },
  );

  return Story_Individual;
};
