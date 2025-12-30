import gql from 'graphql-tag';

export const typeDef = gql`
  input FeatureInput {
    id: String
    number: Int!
    individuals: [IndividualInput]
    title: String
    addinfo: String
  }

  type Feature {
    id: ID
    title: String
    number: Int
    addinfo: String
    issue: Issue
    individuals: [Individual]
  }
`;
