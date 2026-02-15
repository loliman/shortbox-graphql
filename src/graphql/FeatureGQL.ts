import {Feature} from '../database/Feature';
import {Issue} from '../database/Issue';
import {gql} from 'apollo-server';
import {Individual} from '../database/Individual';

export const typeDef = gql`
  input FeatureInput {
    id: String
    number: Int!
    individuals: [IndividualInput]
    title: String
    addinfo: String
  }

  type Feature {
    id: Int
    title: String
    number: Int
    addinfo: String
    issue: Issue
    individuals: [Individual]
  }
`;

export const resolvers = {
  Feature: {
    id: (parent: Feature): number => parent.id,
    title: (parent: Feature): string => parent.title.trim(),
    number: (parent: Feature): number => parent.number,
    addinfo: (parent: Feature): string => parent.addinfo,
    issue: (parent: Feature): Issue => parent.issue,
    individuals: (parent: Feature): Individual[] => parent.individuals,
  },
};
