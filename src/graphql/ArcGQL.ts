import {Arc} from '../database/Arc';
import {Issue} from '../database/Issue';
import {gql} from 'apollo-server';
import {ArcService} from '../service/ArcService';

const service = new ArcService();

export const typeDef = gql`
  extend type Query {
    arcs(pattern: String, type: String, offset: Int): [Arc]
  }

  input ArcInput {
    id: String
    title: String
    type: String
  }

  type Arc {
    id: Int
    title: String
    type: String
    issues: [Issue]
  }
`;

export const resolvers = {
  Arc: {
    id: (parent: Arc): number => parent.id,
    title: (parent: Arc): string => parent.title,
    type: (parent: Arc): string => parent.type,
    issues: (parent: Arc): Issue[] => parent.issues,
  },
  Query: {
    arcs: async (
      _: any,
      {pattern, type, offset}: {pattern: string; type: string; offset: number}
    ) => await service.getArcs(pattern, type, offset),
  },
};
