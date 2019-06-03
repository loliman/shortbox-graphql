import {gql} from 'apollo-server';
import {GraphQLScalarType} from "graphql";

var dateFormat = require('dateformat');

export const typeDef = gql`
  scalar Date
  scalar DateTime
  
  type Mutation {
    _empty: String
  }
  
  type Query {
    _empty: String
  }
  
  input DateFilter {
    date: Date,
    compare: String
  }
  
  input NumberFilter {
    number: String,
    compare: String
  }
  
  input Filter {
    us: Boolean,
    formats: [String],
    withVariants: Boolean,
    releasedates: [DateFilter],
    publishers: [PublisherInput],
    series: [SeriesInput],
    numbers: [NumberFilter],
    authors: [IndividualInput],
    artists: [IndividualInput],
    inkers: [IndividualInput],
    colourists: [IndividualInput],
    letteres: [IndividualInput],
    editors: [IndividualInput],
    translators: [IndividualInput],
    firstPrint: Boolean,
    onlyPrint: Boolean,
    otherTb: Boolean,
    exclusive: Boolean,
    onlyTb: Boolean,
    noPrint: Boolean
  }
`;

export const resolvers = {
    Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
            return new Date(value);
        },
        serialize(value) {
            if(typeof value !== typeof String)
                value = value.toLocaleString();

            if (!value || value.indexOf('-00') !== -1)
                value = '1900-01-01';

            return dateFormat(new Date(value), "yyyy-mm-dd");
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.INT) {
                return parseInt(ast.value, 10);
            }
            return null;
        },
    }),
    DateTime: new GraphQLScalarType({
        name: 'DateTime',
        description: 'DateTime custom scalar type',
        serialize(value) {
            return dateFormat(new Date(value.toString()), "dd.mm.yyyy HH:MM");
        }
    })
};