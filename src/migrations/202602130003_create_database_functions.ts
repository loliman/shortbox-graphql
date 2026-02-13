import fs from 'fs';
import path from 'path';
import { QueryInterface, Transaction } from 'sequelize';
import type { MigrationFn } from 'umzug';

const FUNCTION_DEPLOY_ORDER = [
  'toroman',
  'fromroman',
  'urlencode',
  'createserieslabel',
  'createissuelabel',
  'createlabel',
  'createurl',
  'sortabletitle',
];

type ParsedFunction = {
  name: string;
  statement: string;
};

const parseFunctionsFile = (): ParsedFunction[] => {
  const sqlPath = path.resolve(process.cwd(), 'functions.sql');
  const rawSql = fs.readFileSync(sqlPath, 'utf8');

  const sqlWithoutDelimiter = rawSql
    .split(/\r?\n/)
    .filter((line) => !line.trim().toUpperCase().startsWith('DELIMITER'))
    .join('\n');

  const blocks = sqlWithoutDelimiter
    .split('$$')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/;$/, '').trim());

  const parsed: ParsedFunction[] = [];
  for (const block of blocks) {
    const nameMatch = block.match(/create\s+function\s+`?([a-zA-Z0-9_]+)`?\s*\(/i);
    if (!nameMatch) continue;
    parsed.push({
      name: nameMatch[1].toLowerCase(),
      statement: block,
    });
  }

  return parsed;
};

const sortFunctionsByDependency = (functions: ParsedFunction[]): ParsedFunction[] => {
  const byName = new Map(functions.map((entry) => [entry.name, entry]));
  const ordered: ParsedFunction[] = [];

  for (const name of FUNCTION_DEPLOY_ORDER) {
    const entry = byName.get(name);
    if (!entry) continue;
    ordered.push(entry);
    byName.delete(name);
  }

  for (const remaining of byName.values()) ordered.push(remaining);
  return ordered;
};

const dropFunctionIfExists = async (
  queryInterface: QueryInterface,
  functionName: string,
  transaction: Transaction,
) => {
  await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS \`${functionName}\``, {
    transaction,
  });
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
    const parsedFunctions = parseFunctionsFile();
    const orderedFunctions = sortFunctionsByDependency(parsedFunctions);

    for (const fn of orderedFunctions) {
      await dropFunctionIfExists(queryInterface, fn.name, transaction);
    }

    for (const fn of orderedFunctions) {
      await queryInterface.sequelize.query(fn.statement, { transaction });
    }
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await withTransaction(queryInterface, async (transaction) => {
    const parsedFunctions = parseFunctionsFile();
    const orderedFunctions = sortFunctionsByDependency(parsedFunctions);

    for (const fn of orderedFunctions.reverse()) {
      await dropFunctionIfExists(queryInterface, fn.name, transaction);
    }
  });
};
