import fs from 'fs';
import path from 'path';
import { DataTypes, QueryInterface, Sequelize, Transaction } from 'sequelize';
import logger from '../util/logger';

const MIGRATIONS_TABLE = 'SchemaMigration';

type MigrationContext = {
  sequelize: Sequelize;
  queryInterface: QueryInterface;
  transaction: Transaction;
};

type MigrationModule = {
  up: (ctx: MigrationContext) => Promise<void>;
  down: (ctx: MigrationContext) => Promise<void>;
};

type LoadedMigration = {
  id: string;
  module: MigrationModule;
};

type MigrationStatusItem = {
  id: string;
  applied: boolean;
  appliedAt?: Date;
};

const normalizeTableName = (table: unknown): string => {
  if (typeof table === 'string') return table.toLowerCase();
  if (table && typeof table === 'object') {
    const values = Object.values(table as Record<string, unknown>);
    if (values.length > 0) return String(values[0]).toLowerCase();
  }
  return String(table || '').toLowerCase();
};

const resolveMigrationsDir = (): string => {
  return path.resolve(__dirname, '../migrations');
};

const loadMigrations = (): LoadedMigration[] => {
  const migrationsDir = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) return [];

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.(ts|js)$/.test(name))
    .sort();

  return migrationFiles.map((fileName) => {
    const modulePath = path.resolve(migrationsDir, fileName);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require(modulePath) as Partial<MigrationModule>;

    if (typeof loaded.up !== 'function' || typeof loaded.down !== 'function') {
      throw new Error(`Invalid migration module: ${fileName}`);
    }

    return {
      id: fileName.replace(/\.(ts|js)$/, ''),
      module: {
        up: loaded.up,
        down: loaded.down,
      },
    };
  });
};

const ensureMigrationsTable = async (queryInterface: QueryInterface) => {
  const tables = await queryInterface.showAllTables();
  const tableExists = tables.map(normalizeTableName).includes(MIGRATIONS_TABLE.toLowerCase());
  if (tableExists) return;

  await queryInterface.createTable(MIGRATIONS_TABLE, {
    id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      primaryKey: true,
    },
    appliedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
};

const getAppliedMigrations = async (
  queryInterface: QueryInterface,
  transaction?: Transaction,
): Promise<Array<{ id: string; appliedAt: Date }>> => {
  const rows = (await queryInterface.sequelize.query(
    `SELECT id, appliedAt FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`,
    {
      type: 'SELECT',
      transaction,
    },
  )) as Array<{ id: string; appliedAt: Date }>;

  return rows;
};

const insertMigration = async (queryInterface: QueryInterface, id: string, transaction: Transaction) => {
  await queryInterface.bulkInsert(
    MIGRATIONS_TABLE,
    [
      {
        id,
        appliedAt: new Date(),
      },
    ],
    { transaction },
  );
};

const deleteMigration = async (queryInterface: QueryInterface, id: string, transaction: Transaction) => {
  await queryInterface.bulkDelete(MIGRATIONS_TABLE, { id }, { transaction });
};

export async function runPendingMigrations(sequelize: Sequelize): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMigrationsTable(queryInterface);

  const migrations = loadMigrations();
  if (migrations.length === 0) {
    logger.info('No database migrations found.');
    return;
  }

  const applied = await getAppliedMigrations(queryInterface);
  const appliedSet = new Set(applied.map((entry) => entry.id));
  const pending = migrations.filter((migration) => !appliedSet.has(migration.id));

  if (pending.length === 0) {
    logger.info('Database schema is up to date.');
    return;
  }

  for (const migration of pending) {
    logger.info(`Applying migration ${migration.id}...`);
    const transaction = await sequelize.transaction();
    try {
      await migration.module.up({
        sequelize,
        queryInterface,
        transaction,
      });
      await insertMigration(queryInterface, migration.id, transaction);
      await transaction.commit();
      logger.info(`Applied migration ${migration.id}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export async function rollbackLastMigration(sequelize: Sequelize): Promise<string | null> {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMigrationsTable(queryInterface);

  const migrations = loadMigrations();
  if (migrations.length === 0) return null;

  const applied = await getAppliedMigrations(queryInterface);
  if (applied.length === 0) return null;

  const lastApplied = applied[applied.length - 1];
  const migration = migrations.find((entry) => entry.id === lastApplied.id);
  if (!migration) {
    throw new Error(`Applied migration ${lastApplied.id} is missing from filesystem`);
  }

  logger.info(`Rolling back migration ${migration.id}...`);
  const transaction = await sequelize.transaction();
  try {
    await migration.module.down({
      sequelize,
      queryInterface,
      transaction,
    });
    await deleteMigration(queryInterface, migration.id, transaction);
    await transaction.commit();
    logger.info(`Rolled back migration ${migration.id}`);
    return migration.id;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function getMigrationStatus(sequelize: Sequelize): Promise<MigrationStatusItem[]> {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMigrationsTable(queryInterface);

  const migrations = loadMigrations();
  const applied = await getAppliedMigrations(queryInterface);
  const appliedMap = new Map(applied.map((entry) => [entry.id, entry.appliedAt]));

  return migrations.map((migration) => {
    const appliedAt = appliedMap.get(migration.id);
    return {
      id: migration.id,
      applied: Boolean(appliedAt),
      appliedAt: appliedAt || undefined,
    };
  });
}
