import gql from 'graphql-tag';
import { FilterService } from '../services/FilterService';
import { FilterSchema } from '../types/schemas';
import { Filter, QueryResolvers } from '../types/graphql';

export const typeDef = gql`
  input DateFilter {
    date: Date
    compare: String
  }

  input NumberFilter {
    number: String
    compare: String
    variant: String
  }

  input Filter {
    us: Boolean!
    formats: [String]
    withVariants: Boolean
    releasedates: [DateFilter]
    publishers: [PublisherInput]
    series: [SeriesInput]
    numbers: [NumberFilter]
    arcs: String
    individuals: [IndividualInput]
    appearances: String
    firstPrint: Boolean
    onlyPrint: Boolean
    onlyTb: Boolean
    exclusive: Boolean
    reprint: Boolean
    otherOnlyTb: Boolean
    noPrint: Boolean
    onlyOnePrint: Boolean
    onlyCollected: Boolean
    onlyNotCollected: Boolean
    sellable: Boolean
    noCover: Boolean
    noContent: Boolean
    and: Boolean
  }

  extend type Query {
    export(filter: Filter!, type: String!): String
  }
`;

export const resolvers: { Query: QueryResolvers } = {
  Query: {
    export: async (_, { filter, type }, context) => {
      const { loggedIn, filterService } = context;

      // Validate input
      const validatedFilter = FilterSchema.parse(filter);

      return await filterService.export(validatedFilter as Filter, type, loggedIn);
    },
  },
};
