import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Query {
    apps(pattern: String, type: String, first: Int, after: String): AppearanceConnection
    realities(pattern: String, first: Int, after: String): RealityConnection
  }

  type AppearanceConnection {
    edges: [AppearanceEdge]
    pageInfo: PageInfo!
  }

  type AppearanceEdge {
    cursor: String!
    node: Appearance
  }

  input AppearanceInput {
    id: String
    name: String
    type: String
    role: String
  }

  type Appearance {
    id: ID
    name: String
    type: String
    role: String
  }

  type RealityConnection {
    edges: [RealityEdge]
    pageInfo: PageInfo!
  }

  type RealityEdge {
    cursor: String!
    node: Reality
  }

  input RealityInput {
    id: String
    name: String
  }

  type Reality {
    id: ID
    name: String
  }
`;
