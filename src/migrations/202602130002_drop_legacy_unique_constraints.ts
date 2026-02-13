import { QueryInterface, Transaction } from 'sequelize';
import type { MigrationFn } from 'umzug';

type ConstraintDefinition = {
  tableName: string;
  constraintName: string;
  columns: string[];
};

const LEGACY_UNIQUE_CONSTRAINTS: ConstraintDefinition[] = [
  {
    tableName: 'cover_individual',
    constraintName: 'cover_individual_fk_individual_fk_cover_unique',
    columns: ['fk_individual', 'fk_cover'],
  },
  {
    tableName: 'feature_individual',
    constraintName: 'feature_individual_fk_individual_fk_feature_unique',
    columns: ['fk_individual', 'fk_feature'],
  },
  {
    tableName: 'issue_individual',
    constraintName: 'issue_individual_fk_issue_fk_individual_unique',
    columns: ['fk_issue', 'fk_individual'],
  },
  {
    tableName: 'story_individual',
    constraintName: 'story_individual_fk_story_fk_individual_unique',
    columns: ['fk_story', 'fk_individual'],
  },
  {
    tableName: 'story_appearance',
    constraintName: 'story_appearance_fk_story_fk_appearance_unique',
    columns: ['fk_story', 'fk_appearance'],
  },
  {
    tableName: 'Cover_Individual',
    constraintName: 'Cover_Individual_fk_individual_fk_cover_unique',
    columns: ['fk_individual', 'fk_cover'],
  },
  {
    tableName: 'Feature_Individual',
    constraintName: 'Feature_Individual_fk_individual_fk_feature_unique',
    columns: ['fk_individual', 'fk_feature'],
  },
  {
    tableName: 'Issue_Individual',
    constraintName: 'Issue_Individual_fk_issue_fk_individual_unique',
    columns: ['fk_issue', 'fk_individual'],
  },
  {
    tableName: 'Story_Individual',
    constraintName: 'Story_Individual_fk_story_fk_individual_unique',
    columns: ['fk_story', 'fk_individual'],
  },
  {
    tableName: 'Story_Appearance',
    constraintName: 'Story_Appearance_fk_story_fk_appearance_unique',
    columns: ['fk_story', 'fk_appearance'],
  },
];

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

const constraintExists = async (
  queryInterface: QueryInterface,
  tableName: string,
  constraintName: string,
  transaction: Transaction,
): Promise<boolean> => {
  const rows = (await queryInterface.sequelize.query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND CONSTRAINT_NAME = :constraintName`,
    {
      replacements: { tableName, constraintName },
      type: 'SELECT',
      transaction,
    },
  )) as Array<{ CONSTRAINT_NAME: string }>;

  return rows.length > 0;
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
    for (const definition of LEGACY_UNIQUE_CONSTRAINTS) {
      const exists = await tableExists(queryInterface, definition.tableName);
      if (!exists) continue;

      const hasConstraint = await constraintExists(
        queryInterface,
        definition.tableName,
        definition.constraintName,
        transaction,
      );
      if (!hasConstraint) continue;

      await queryInterface.removeConstraint(definition.tableName, definition.constraintName, {
        transaction,
      });
    }
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await withTransaction(queryInterface, async (transaction) => {
    for (const definition of LEGACY_UNIQUE_CONSTRAINTS) {
      const exists = await tableExists(queryInterface, definition.tableName);
      if (!exists) continue;

      const hasConstraint = await constraintExists(
        queryInterface,
        definition.tableName,
        definition.constraintName,
        transaction,
      );
      if (hasConstraint) continue;

      await queryInterface.addConstraint(definition.tableName, {
        fields: definition.columns,
        type: 'unique',
        name: definition.constraintName,
        transaction,
      });
    }
  });
};
