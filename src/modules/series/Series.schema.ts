import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    deleteSeries(item: SeriesInput!): Boolean
    createSeries(item: SeriesInput!): Series
    editSeries(old: SeriesInput!, item: SeriesInput!): Series
  }

  extend type Query {
    series(pattern: String, publisher: PublisherInput!, offset: Int, limit: Int, filter: Filter): [Series]
    seriesd(series: SeriesInput!): Series
  }

  input SeriesInput {
    id: String
    title: String
    startyear: Int
    endyear: Int
    volume: Int
    addinfo: String
    publisher: PublisherInput
  }

  type Series {
    id: ID
    title: String
    startyear: Int
    endyear: Int
    volume: Int
    issueCount: Int
    firstIssue: Issue
    lastIssue: Issue
    lastEdited(limit: Int): [Issue]
    active: Boolean
    addinfo: String
    publisher: Publisher
  }
`;
