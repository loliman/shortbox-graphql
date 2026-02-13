import { DataTypes, QueryInterface, Sequelize, Transaction } from 'sequelize';

const TABLE_NAME = 'UserSession';

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
      fk_user: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'User',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      tokenhash: {
        type: DataTypes.STRING(128),
        allowNull: false,
        unique: true,
      },
      expiresat: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedat: {
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

  await queryInterface.addIndex(TABLE_NAME, ['tokenhash'], {
    unique: true,
    name: 'usersession_tokenhash_unique',
    transaction,
  });
  await queryInterface.addIndex(TABLE_NAME, ['fk_user'], {
    name: 'usersession_fk_user_idx',
    transaction,
  });
  await queryInterface.addIndex(TABLE_NAME, ['expiresat'], {
    name: 'usersession_expiresat_idx',
    transaction,
  });
  await queryInterface.addIndex(TABLE_NAME, ['revokedat'], {
    name: 'usersession_revokedat_idx',
    transaction,
  });
}

export async function down({ queryInterface, transaction }: MigrationContext) {
  const exists = await tableExists(queryInterface, TABLE_NAME);
  if (!exists) return;
  await queryInterface.dropTable(TABLE_NAME, { transaction });
}
