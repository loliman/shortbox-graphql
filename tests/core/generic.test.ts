import { print } from 'graphql';
import { DateResolver, DateTimeResolver } from 'graphql-scalars';
import { resolvers, typeDef } from '../../src/api/generic';

describe('api generic schema', () => {
  it('declares base scalar and root placeholder types', () => {
    const printed = print(typeDef);

    expect(printed).toContain('scalar Date');
    expect(printed).toContain('scalar DateTime');
    expect(printed).toContain('type Query');
    expect(printed).toContain('type Mutation');
    expect(printed).toContain('_empty: String');
  });

  it('wires scalar resolvers to graphql-scalars', () => {
    expect(resolvers.Date).toBe(DateResolver);
    expect(resolvers.DateTime).toBe(DateTimeResolver);
  });
});
