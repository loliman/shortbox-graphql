import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    login(credentials: LoginInput!): User!
    logout: Boolean!
  }

  input LoginInput {
    name: String!
    password: String!
  }

  type User {
    id: ID
  }
`;
