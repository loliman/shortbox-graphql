import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Query {
    arcs(pattern: String, type: String, first: Int, after: String): ArcConnection
  }

  type ArcConnection {
    edges: [ArcEdge]
    pageInfo: PageInfo!
  }

  type ArcEdge {
    cursor: String!
    node: Arc
  }

  input ArcInput {
    id: String
    title: String
    type: String
  }

  type Arc {
    id: ID
    title: String
    type: String
    issues: [Issue]
  }
`;
