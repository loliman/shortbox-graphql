import { readFileSync } from 'node:fs';
import gql from 'graphql-tag';

const schemaPath = require.resolve('@loliman/shortbox-contract/schema/shortbox.graphql');
const schemaSdl = readFileSync(schemaPath, 'utf8');

export const typeDefs = gql(schemaSdl);
