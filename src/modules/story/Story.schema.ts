import gql from 'graphql-tag';

export const typeDef = gql`
  input StoryInput {
    number: Int!
    title: String
    parent: StoryInput
    reprintOf: StoryInput
    issue: IssueInput
    individuals: [IndividualInput]
    appearances: [AppearanceInput]
    onlyapp: Boolean
    firstapp: Boolean
    onlytb: Boolean
    otheronlytb: Boolean
    onlyoneprint: Boolean
    collected: Boolean
    addinfo: String
    part: String
    exclusive: Boolean
  }

  type Story {
    id: ID
    number: Int
    title: String
    parent: Story
    reprintOf: Story
    reprints: [Story]
    children: [Story]
    issue: Issue
    individuals: [Individual]
    appearances: [Appearance]
    onlyapp: Boolean
    firstapp: Boolean
    onlytb: Boolean
    otheronlytb: Boolean
    onlyoneprint: Boolean
    collected: Boolean
    addinfo: String
    part: String
    exclusive: Boolean
    collectedmultipletimes: Boolean
  }
`;
