import {Individual} from '../database/Individual';
import {gql} from 'apollo-server';
import {IndividualService} from '../service/IndividualService';

const service = new IndividualService();

export const typeDef = gql`
  extend type Query {
    individuals(pattern: String, offset: Int): [Individual]
  }

  input IndividualInput {
    name: String
    type: [String]
  }

  type Individual {
    id: Int
    name: String
    type: String
  }
`;

export const resolvers = {
  Individual: {
    id: (parent: Individual): number => parent.id,
    name: (parent: Individual): string => parent.name,
    type: (parent: Individual): string => parent.type,
  },
  Query: {
    individuals: async (
      _: any,
      {pattern, type, offset}: {pattern: string; type: string; offset: number}
    ) => await service.getIndividuals(pattern, type, offset),
  },
};
