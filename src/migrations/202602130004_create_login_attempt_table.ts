import { DataTypes, QueryInterface, Sequelize, Transaction } from 'sequelize';

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

type MigrationContext = {
  queryInterface: QueryInterface;
  sequelize: Sequelize;
  transaction: Transaction;
};

export async function up({ queryInterface, transaction }: MigrationContext) {
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
}

export async function down({ queryInterface, transaction }: MigrationContext) {
  const exists = await tableExists(queryInterface, TABLE_NAME);
  if (!exists) return;
  await queryInterface.dropTable(TABLE_NAME, { transaction });
}
