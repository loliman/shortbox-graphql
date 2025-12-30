import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Query {
    arcs(pattern: String, type: String, offset: Int): [Arc]
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
