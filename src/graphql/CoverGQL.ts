import {Cover} from '../database/Cover';
import {Issue} from '../database/Issue';
import {Individual} from '../database/Individual';
import {gql} from 'apollo-server';

export const typeDef = gql`
  input CoverInput {
    number: Int!
    parent: CoverInput
    issue: IssueInput
    individuals: [IndividualInput]
    addinfo: String
    coloured: Boolean
    fullsize: Boolean
    exclusive: Boolean
  }

  type Cover {
    id: Int
    url: String
    number: Int
    addinfo: String
    parent: Cover
    children: [Cover]

    exclusive: Boolean

    onlyapp: Boolean
    firstapp: Boolean
    firstpartly: Boolean
    firstcomplete: Boolean
    firstmonochrome: Boolean
    firstcoloured: Boolean
    firstsmall: Boolean
    firstfullsize: Boolean
    onlytb: Boolean
    onlyoneprint: Boolean
    onlypartly: Boolean
    onlymonochrome: Boolean
    onlysmall: Boolean

    coloured: Boolean
    fullsize: Boolean
    issue: Issue
    individuals: [Individual]
  }
`;

export const resolvers = {
  Cover: {
    id: (parent: Cover): number => parent.id,
    url: (parent: Cover): string => parent.url,
    number: (parent: Cover): number => parent.number,
    parent: (parent: Cover): Cover => parent.parent,
    issue: (parent: Cover): Issue => parent.issue,
    children: (parent: Cover): Cover[] => parent.children,
    coloured: (parent: Cover): number => parent.coloured,
    onlyapp: (parent: Cover): number => parent.onlyapp,
    firstapp: (parent: Cover): number => parent.firstapp,
    firstpartly: (parent: Cover): number => parent.firstpartly,
    firstcomplete: (parent: Cover): number => parent.firstcomplete,
    firstmonochrome: (parent: Cover): number => parent.firstmonochrome,
    firstcoloured: (parent: Cover): number => parent.firstcoloured,
    firstsmall: (parent: Cover): number => parent.firstsmall,
    firstfullsize: (parent: Cover): number => parent.firstfullsize,
    exclusive: (parent: Cover): number => parent.exclusive,
    onlytb: (parent: Cover): number => parent.onlytb,
    onlyoneprint: (parent: Cover): number => parent.onlyoneprint,
    onlymonochrome: (parent: Cover): number => parent.onlymonochrome,
    onlypartly: (parent: Cover): number => parent.onlypartly,
    onlysmall: (parent: Cover): number => parent.onlysmall,
    addinfo: (parent: Cover): string => parent.addinfo,
    individuals: (parent: Cover): Individual[] => parent.individuals,
  },
};
