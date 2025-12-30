import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Query {
    individuals(pattern: String, offset: Int): [Individual]
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
