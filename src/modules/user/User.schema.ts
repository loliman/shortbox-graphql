import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    login(user: UserInput!): User
    logout: Boolean
  }

  input UserInput {
    id: Int
    name: String
    password: String
  }

  type User {
    id: ID
  }
`;
