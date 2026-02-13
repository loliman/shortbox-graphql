import type {
  Appearance,
  AppearanceConnection,
  AppearanceInput,
  Arc,
  ArcConnection,
  ArcInput,
  Cover,
  CoverInput,
  DateFilter,
  Feature,
  FeatureInput,
  Filter,
  Individual,
  IndividualConnection,
  IndividualInput,
  Issue,
  IssueConnection,
  IssueInput,
  Node,
  NumberFilter,
  PageInfo,
  Publisher,
  PublisherConnection,
  PublisherInput,
  Query,
  Series,
  SeriesConnection,
  SeriesInput,
  Story,
  StoryInput,
  User,
  UserInput,
} from '@shortbox/contract';
import type { Context } from '../core/server';

export type {
  Appearance,
  AppearanceConnection,
  AppearanceInput,
  Arc,
  ArcConnection,
  ArcInput,
  Cover,
  CoverInput,
  DateFilter,
  Feature,
  FeatureInput,
  Filter,
  Individual,
  IndividualConnection,
  IndividualInput,
  Issue,
  IssueConnection,
  IssueInput,
  Node,
  NumberFilter,
  PageInfo,
  Publisher,
  PublisherConnection,
  PublisherInput,
  Query,
  Series,
  SeriesConnection,
  SeriesInput,
  Story,
  StoryInput,
  User,
  UserInput,
};

export type ResolverFn<Parent = unknown, Args = unknown, Result = unknown> = (
  parent: Parent,
  args: Args,
  context: Context,
  info?: unknown,
) => Promise<Result> | Result;

export type ResolverMap = Record<string, ResolverFn<any, any, any>>;

export type QueryResolvers = ResolverMap;
export type MutationResolvers = ResolverMap;

export interface CoverResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Cover?: ResolverMap;
}

export interface AppearanceResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Appearance?: ResolverMap;
}

export interface FeatureResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Feature?: ResolverMap;
}

export interface ArcResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Arc?: ResolverMap;
}

export interface IndividualResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Individual?: ResolverMap;
}

export interface PublisherResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Publisher?: ResolverMap;
}

export interface IssueResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Issue?: ResolverMap;
}

export interface UserResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  User?: ResolverMap;
}

export interface SeriesResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Series?: ResolverMap;
}

export interface StoryResolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Story?: ResolverMap;
}

export interface Resolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Node?: ResolverMap;
  Publisher?: ResolverMap;
  Series?: ResolverMap;
  Issue?: ResolverMap;
  Story?: ResolverMap;
  Cover?: ResolverMap;
  Arc?: ResolverMap;
  Individual?: ResolverMap;
  Appearance?: ResolverMap;
  Feature?: ResolverMap;
  User?: ResolverMap;
}
