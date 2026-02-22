import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import gql from 'graphql-tag';

const localSchemaPath = resolve(__dirname, '../../../shortbox-contract/schema/shortbox.graphql');
const schemaPath = existsSync(localSchemaPath)
  ? localSchemaPath
  : require.resolve('@loliman/shortbox-contract/schema/shortbox.graphql');
const schemaSdl = readFileSync(schemaPath, 'utf8');

export const typeDefs = gql(schemaSdl);
