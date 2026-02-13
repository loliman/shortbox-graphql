import gql from 'graphql-tag';
import { GraphQLScalarType, Kind } from 'graphql';
import dateFormat from 'dateformat';

const parseDateLike = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const fixtureFormatMatch = trimmed.match(
      /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/,
    );
    if (fixtureFormatMatch) {
      const [, dd, mm, yyyy, hh = '00', min = '00'] = fixtureFormatMatch;
      const day = Number(dd);
      const month = Number(mm) - 1;
      const year = Number(yyyy);
      const hour = Number(hh);
      const minute = Number(min);
      const parsed = new Date(year, month, day, hour, minute, 0, 0);
      const valid =
        parsed.getFullYear() === year &&
        parsed.getMonth() === month &&
        parsed.getDate() === day &&
        parsed.getHours() === hour &&
        parsed.getMinutes() === minute;
      return valid ? parsed : null;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const asString =
    value !== null && value !== undefined
      ? (value as { toString?: () => string })?.toString?.() || ''
      : '';
  if (!asString) return null;

  const parsed = new Date(asString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const typeDef = gql`
  scalar Date
  scalar DateTime

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type Mutation {
    _empty: String
  }

  type Query {
    _empty: String
  }
`;

export const resolvers = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value: unknown) {
      return parseDateLike(value);
    },
    serialize(value: unknown) {
      const parsed = parseDateLike(value);
      return parsed ? dateFormat(parsed, 'yyyy-mm-dd') : '1900-01-01';
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return new Date(parseInt(ast.value, 10));
      }
      return null;
    },
  }),
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'DateTime custom scalar type',
    serialize(value: unknown) {
      const parsed = parseDateLike(value);
      return parsed ? dateFormat(parsed, 'dd.mm.yyyy HH:MM') : '01.01.1900 00:00';
    },
  }),
};
