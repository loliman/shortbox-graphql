import gql from 'graphql-tag';
import { FilterService } from '../services/FilterService';
import { FilterSchema } from '../types/schemas';
import { Filter, FilterResolvers } from '../types/graphql';

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
    arcs: [ArcInput]
    individuals: [IndividualInput]
    appearances: [AppearanceInput]
    firstPrint: Boolean
    notFirstPrint: Boolean
    onlyPrint: Boolean
    notOnlyPrint: Boolean
    onlyTb: Boolean
    notOnlyTb: Boolean
    exclusive: Boolean
    notExclusive: Boolean
    reprint: Boolean
    notReprint: Boolean
    otherOnlyTb: Boolean
    notOtherOnlyTb: Boolean
    noPrint: Boolean
    notNoPrint: Boolean
    onlyOnePrint: Boolean
    notOnlyOnePrint: Boolean
    onlyCollected: Boolean
    onlyNotCollected: Boolean
    onlyNotCollectedNoOwnedVariants: Boolean
    noComicguideId: Boolean
    noContent: Boolean
  }

  extend type Query {
    export(filter: Filter!, type: String!): String
  }
`;

export const resolvers: FilterResolvers = {
  Query: {
    export: async (_, { filter, type }, context) => {
      const { loggedIn, filterService } = context;

      // Validate input
      const validatedFilter = FilterSchema.parse(filter);

      return await filterService.export(validatedFilter as Filter, type, loggedIn);
    },
  },
};
