import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Query {
    apps(pattern: String, type: String, offset: Int): [Appearance]
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
`;
