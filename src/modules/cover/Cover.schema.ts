import gql from 'graphql-tag';

export const typeDef = gql`
  input CoverInput {
    number: Int!
    parent: CoverInput
    issue: IssueInput
    individuals: [IndividualInput]
    addinfo: String
    exclusive: Boolean
  }

  type Cover {
    id: ID
    url: String
    number: Int
    addinfo: String
    parent: Cover
    children: [Cover]
    onlyapp: Boolean
    firstapp: Boolean
    exclusive: Boolean
    issue: Issue
    individuals: [Individual]
  }
`;
