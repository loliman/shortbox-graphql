import {Story} from '../database/Story';
import {Issue} from '../database/Issue';
import {Individual} from '../database/Individual';
import {Appearance} from '../database/Appearance';
import {gql} from 'apollo-server';

export const typeDef = gql`
  input StoryInput {
    id: String
    number: Int!
    parent: StoryInput
    issue: IssueInput
    individuals: [IndividualInput]
    appearances: [AppearanceInput]
    title: String
    addinfo: String
    pages: [Int]
    coloured: Boolean
    exclusive: Boolean
  }

  type Story {
    id: Int
    title: String
    number: Int
    addinfo: String
    pages: [Int]
    coloured: Boolean
    issue: Issue
    parent: Story
    children: [Story]
    reprintOf: Story
    reprints: [Story]

    exclusive: Boolean

    onlyapp: Boolean
    firstapp: Boolean
    firstpartly: Boolean
    firstcomplete: Boolean
    firstmonochrome: Boolean
    firstcoloured: Boolean
    onlytb: Boolean
    onlyoneprint: Boolean
    onlypartly: Boolean
    onlymonochrome: Boolean

    appearances: [Appearance]
    individuals: [Individual]
  }
`;

export const resolvers = {
  Story: {
    id: (parent: Story): number => parent.id,
    title: (parent: Story): string => parent.title,
    number: (parent: Story): number => parent.number,
    addinfo: (parent: Story): string | undefined => parent.addinfo,
    pages: (parent: Story): number[] =>
      parent.pages
        ? parent.pages
            .split('#')
            .filter(x => x !== '')
            .map(x => +x)
        : [],
    coloured: (parent: Story): number => parent.coloured,
    issue: (parent: Story): Issue => parent.issue,
    parent: (parent: Story): Story => parent.parent,
    children: (parent: Story): Story[] => parent.children,
    reprintOf: (parent: Story): Story => parent.reprintOf,
    reprints: (parent: Story): Story[] => parent.reprints,
    onlyapp: (parent: Story): number => parent.onlyapp,
    firstapp: (parent: Story): number => parent.firstapp,
    firstpartly: (parent: Story): number => parent.firstpartly,
    firstcomplete: (parent: Story): number => parent.firstcomplete,
    firstmonochrome: (parent: Story): number => parent.firstmonochrome,
    firstcoloured: (parent: Story): number => parent.firstcoloured,
    exclusive: (parent: Story): number => parent.exclusive,
    onlytb: (parent: Story): number => parent.onlytb,
    onlyoneprint: (parent: Story): number => parent.onlyoneprint,
    onlymonochrome: (parent: Story): number => parent.onlymonochrome,
    onlypartly: (parent: Story): number => parent.onlypartly,
    individuals: (parent: Story): Individual[] => parent.individuals,
    appearances: (parent: Story): Appearance[] => parent.appearances,
  },
};
