import path from 'path';
import { DataTypes, QueryInterface } from 'sequelize';
import { SequelizeStorage, type RunnableMigration, Umzug } from 'umzug';
import sequelize from './database';

const MIGRATIONS_TABLE = 'SchemaMigration';
const MIGRATION_NAME_COLUMN = 'id';
const MIGRATION_APPLIED_AT_COLUMN = 'appliedAt';

const ensureStorageModel = () => {
  if (sequelize.isDefined(MIGRATIONS_TABLE)) {
    return sequelize.model(MIGRATIONS_TABLE);
  }

  return sequelize.define(
    MIGRATIONS_TABLE,
    {
      [MIGRATION_NAME_COLUMN]: {
        type: DataTypes.STRING(255),
        allowNull: false,
        primaryKey: true,
      },
      [MIGRATION_APPLIED_AT_COLUMN]: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: MIGRATIONS_TABLE,
      freezeTableName: true,
      timestamps: false,
    },
  );
};

const normalizeMigrationName = (name: string): string => {
  return name.replace(/\.(ts|js)$/i, '');
};

const storageModel = ensureStorageModel();

export const migrator = new Umzug<QueryInterface>({
  context: sequelize.getQueryInterface(),
  migrations: {
    glob: path.join(__dirname, '../migrations/*.{ts,js}'),
    resolve: (params): RunnableMigration<QueryInterface> => {
      const resolved = Umzug.defaultResolver(params) as RunnableMigration<QueryInterface>;
      return {
        ...resolved,
        name: normalizeMigrationName(params.name),
      };
    },
  },
  storage: new SequelizeStorage({
    model: storageModel,
    columnName: MIGRATION_NAME_COLUMN,
  }),
  logger: console,
});
