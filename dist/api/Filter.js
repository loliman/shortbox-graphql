"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const schemas_1 = require("../types/schemas");
exports.typeDef = (0, graphql_tag_1.default) `
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
exports.resolvers = {
    Query: {
        export: async (_, { filter, type }, context) => {
            const { loggedIn, filterService } = context;
            // Validate input
            const validatedFilter = schemas_1.FilterSchema.parse(filter);
            return await filterService.export(validatedFilter, type, loggedIn);
        },
    },
};
