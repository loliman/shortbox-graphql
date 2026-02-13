import { DataTypes, QueryInterface, Transaction } from 'sequelize';
import type { MigrationFn } from 'umzug';

const TABLE_NAME = 'UserSession';
const COLUMN_NAME = 'csrftokenhash';

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

const hasColumn = async (
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const description = await queryInterface.describeTable(tableName);
  return Object.prototype.hasOwnProperty.call(description, columnName);
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

    const columnExists = await hasColumn(queryInterface, TABLE_NAME, COLUMN_NAME);
    if (!columnExists) {
      await queryInterface.addColumn(
        TABLE_NAME,
        COLUMN_NAME,
        {
          type: DataTypes.STRING(128),
          allowNull: true,
        },
        { transaction },
      );
    }

    await queryInterface.addIndex(TABLE_NAME, [COLUMN_NAME], {
      name: 'usersession_csrftokenhash_idx',
      transaction,
    });
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await withTransaction(queryInterface, async (transaction) => {
    const exists = await tableExists(queryInterface, TABLE_NAME);
    if (!exists) return;

    await queryInterface.removeIndex(TABLE_NAME, 'usersession_csrftokenhash_idx', { transaction });

    const columnExists = await hasColumn(queryInterface, TABLE_NAME, COLUMN_NAME);
    if (!columnExists) return;

    await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME, { transaction });
  });
};
