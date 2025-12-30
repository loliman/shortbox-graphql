import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    login(user: UserInput!): User
    logout(user: UserInput!): Boolean
  }

  input UserInput {
    id: Int
    name: String
    password: String
    sessionid: String
  }

  type User {
    id: ID
    sessionid: String
  }
`;
