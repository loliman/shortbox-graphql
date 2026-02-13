import { DataTypes, QueryInterface, Transaction } from 'sequelize';
import type { MigrationFn } from 'umzug';

const TABLE_NAME = 'LoginAttempt';

const normalizeTableName = (table: unknown): string => {
  if (typeof table === 'string') return table.toLowerCase();
  if (table && typeof table === 'object') {
    const values = Object.values(table as Record<string, unknown>);
    if (values.length > 0) return String(values[0]).toLowerCase();
  }
  return String(table || '').toLowerCase();
};

const tableExists = async (queryInterface: QueryInterface, tableName: string): Promise<boolean> => {
  const tables = await queryInterface.showAllTables();
  return tables.map(normalizeTableName).includes(tableName.toLowerCase());
};

const withTransaction = async (
  queryInterface: QueryInterface,
  run: (transaction: Transaction) => Promise<void>,
) => {
  const transaction = await queryInterface.sequelize.transaction();
  try {
    await run(transaction);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await withTransaction(queryInterface, async (transaction) => {
    const exists = await tableExists(queryInterface, TABLE_NAME);
    if (!exists) return;
    await queryInterface.dropTable(TABLE_NAME, { transaction });
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await withTransaction(queryInterface, async (transaction) => {
    const exists = await tableExists(queryInterface, TABLE_NAME);
    if (exists) return;

    await queryInterface.createTable(
      TABLE_NAME,
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          allowNull: false,
          autoIncrement: true,
        },
        scope: {
          type: DataTypes.STRING(512),
          allowNull: false,
          unique: true,
        },
        failures: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        windowstartat: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        lockeduntilat: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
      },
      { transaction },
    );

    await queryInterface.addIndex(TABLE_NAME, ['scope'], {
      unique: true,
      name: 'loginattempt_scope_unique',
      transaction,
    });
    await queryInterface.addIndex(TABLE_NAME, ['lockeduntilat'], {
      name: 'loginattempt_lockeduntilat_idx',
      transaction,
    });
  });
};
