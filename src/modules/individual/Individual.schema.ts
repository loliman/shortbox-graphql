import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Query {
    individuals(pattern: String, first: Int, after: String): IndividualConnection
  }

  type IndividualConnection {
    edges: [IndividualEdge]
    pageInfo: PageInfo!
  }

  type IndividualEdge {
    cursor: String!
    node: Individual
  }

  input IndividualInput {
    name: String
    type: [String]
  }

  type Individual {
    id: ID
    name: String
    type: [String]
  }
`;
