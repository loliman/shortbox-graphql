import gql from 'graphql-tag';
import { FilterService } from '../services/FilterService';
import { FilterSchema } from '../types/schemas';
import { Filter } from '../types/graphql';

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
    genres: [String]
    numbers: [NumberFilter]
    arcs: [ArcInput]
    individuals: [IndividualInput]
    appearances: [AppearanceInput]
    realities: [RealityInput]
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
    filterCount(filter: Filter!): Int!
  }
`;

export const resolvers = {
  Query: {
    export: async (
      _: unknown,
      { filter, type }: { filter: Filter; type: string },
      context: { loggedIn: boolean; filterService: FilterService },
    ) => {
      const { loggedIn, filterService } = context;

      // Validate input
      const validatedFilter = FilterSchema.parse(filter);

      return await filterService.export(validatedFilter as Filter, type, loggedIn);
    },
    filterCount: async (
      _: unknown,
      { filter }: { filter: Filter },
      context: { loggedIn: boolean; filterService: FilterService },
    ) => {
      const { loggedIn, filterService } = context;
      const validatedFilter = FilterSchema.parse(filter);
      return await filterService.count(validatedFilter as Filter, loggedIn);
    },
  },
};
