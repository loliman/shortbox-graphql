import {Appearance} from '../database/Appearance';
import {gql} from 'apollo-server';
import {StringUtils} from '../util/StringUtils';
import {Story} from '../database/Story';
import {AppearanceService} from '../service/AppearanceService';

const service = new AppearanceService();

export const typeDef = gql`
  extend type Query {
    apps(pattern: String, type: String, offset: Int): [Appearance]
  }

  input AppearanceInput {
    id: String
    name: String
    type: String
    role: String
    firstapp: Boolean
  }

  type Appearance {
    id: Int
    name: String
    type: String
    role: String
    firstapp: Boolean
    stories: [Story]
  }
`;

export const resolvers = {
  Appearance: {
    id: (parent: Appearance): number => parent.id,
    name: (parent: Appearance): string => parent.name.trim(),
    type: (parent: Appearance): string =>
      StringUtils.isEmpty(parent.type) ? 'CHARACTER' : parent.type,
    role: (parent: Appearance): string => parent.role,
    firstapp: (parent: Appearance): boolean => parent.firstapp,
    stories: (parent: Appearance): Story[] => parent.stories,
  },
  Query: {
    apps: async (
      _: any,
      {pattern, type, offset}: {pattern: string; type: string; offset: number}
    ) => await service.getAppearances(pattern, type, offset),
  },
};
