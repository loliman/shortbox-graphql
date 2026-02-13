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
  LoginInput,
  Mutation,
  MutationCreateIssueArgs,
  MutationCreatePublisherArgs,
  MutationCreateSeriesArgs,
  MutationDeleteIssueArgs,
  MutationDeletePublisherArgs,
  MutationDeleteSeriesArgs,
  MutationEditIssueArgs,
  MutationEditPublisherArgs,
  MutationEditSeriesArgs,
  MutationLoginArgs,
  Node,
  NumberFilter,
  PageInfo,
  Publisher,
  PublisherConnection,
  PublisherInput,
  Query,
  QueryAppsArgs,
  QueryArcsArgs,
  QueryExportArgs,
  QueryIndividualsArgs,
  QueryIssueArgs,
  QueryIssuesArgs,
  QueryLastEditedArgs,
  QueryNodesArgs,
  QueryPublisherArgs,
  QueryPublishersArgs,
  QuerySeriesArgs,
  QuerySeriesdArgs,
  Series,
  SeriesConnection,
  SeriesInput,
  Story,
  StoryInput,
  User,
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
  LoginInput,
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
};

type EmptyArgs = Record<string, never>;

type BivariantResolver<Parent, Args, Result> = {
  bivarianceHack(
    parent: Parent,
    args: Args,
    context: Context,
    info?: unknown,
  ): Promise<Result> | Result;
}['bivarianceHack'];

export type ResolverFn<Parent = unknown, Args = EmptyArgs, Result = unknown> = BivariantResolver<
  Parent,
  Args,
  Result
>;

export type ObjectResolvers = Record<string, ResolverFn>;

export type QueryResolverFields = {
  _empty: ResolverFn<unknown, EmptyArgs, unknown>;
  apps: ResolverFn<unknown, QueryAppsArgs, unknown>;
  arcs: ResolverFn<unknown, QueryArcsArgs, unknown>;
  export: ResolverFn<unknown, QueryExportArgs, unknown>;
  individuals: ResolverFn<unknown, QueryIndividualsArgs, unknown>;
  issue: ResolverFn<unknown, QueryIssueArgs, unknown>;
  issues: ResolverFn<unknown, QueryIssuesArgs, unknown>;
  lastEdited: ResolverFn<unknown, QueryLastEditedArgs, unknown>;
  me: ResolverFn<unknown, EmptyArgs, unknown>;
  nodes: ResolverFn<unknown, QueryNodesArgs, unknown>;
  publisher: ResolverFn<unknown, QueryPublisherArgs, unknown>;
  publishers: ResolverFn<unknown, QueryPublishersArgs, unknown>;
  series: ResolverFn<unknown, QuerySeriesArgs, unknown>;
  seriesd: ResolverFn<unknown, QuerySeriesdArgs, unknown>;
};

export type MutationResolverFields = {
  _empty: ResolverFn<unknown, EmptyArgs, unknown>;
  createIssue: ResolverFn<unknown, MutationCreateIssueArgs, unknown>;
  createPublisher: ResolverFn<unknown, MutationCreatePublisherArgs, unknown>;
  createSeries: ResolverFn<unknown, MutationCreateSeriesArgs, unknown>;
  deleteIssue: ResolverFn<unknown, MutationDeleteIssueArgs, unknown>;
  deletePublisher: ResolverFn<unknown, MutationDeletePublisherArgs, unknown>;
  deleteSeries: ResolverFn<unknown, MutationDeleteSeriesArgs, unknown>;
  editIssue: ResolverFn<unknown, MutationEditIssueArgs, unknown>;
  editPublisher: ResolverFn<unknown, MutationEditPublisherArgs, unknown>;
  editSeries: ResolverFn<unknown, MutationEditSeriesArgs, unknown>;
  login: ResolverFn<unknown, MutationLoginArgs, unknown>;
  logout: ResolverFn<unknown, EmptyArgs, unknown>;
};

export type QueryResolvers = Partial<QueryResolverFields>;
export type MutationResolvers = Partial<MutationResolverFields>;

export interface CoverResolvers {
  Cover?: ObjectResolvers;
}

export interface AppearanceResolvers {
  Query?: Pick<QueryResolvers, 'apps'>;
  Appearance?: ObjectResolvers;
}

export interface FeatureResolvers {
  Feature?: ObjectResolvers;
}

export interface ArcResolvers {
  Query?: Pick<QueryResolvers, 'arcs'>;
  Arc?: ObjectResolvers;
}

export interface IndividualResolvers {
  Query?: Pick<QueryResolvers, 'individuals'>;
  Individual?: ObjectResolvers;
}

export interface PublisherResolvers {
  Query?: Pick<QueryResolvers, 'publishers' | 'publisher'>;
  Mutation?: Pick<MutationResolvers, 'deletePublisher' | 'createPublisher' | 'editPublisher'>;
  Publisher?: ObjectResolvers;
}

export interface IssueResolvers {
  Query?: Pick<QueryResolvers, 'issues' | 'issue' | 'lastEdited'>;
  Mutation?: Pick<MutationResolvers, 'deleteIssue' | 'createIssue' | 'editIssue'>;
  Issue?: ObjectResolvers;
}

export interface UserResolvers {
  Query?: Pick<QueryResolvers, 'me'>;
  Mutation?: Pick<MutationResolvers, 'login' | 'logout'>;
  User?: ObjectResolvers;
}

export interface SeriesResolvers {
  Query?: Pick<QueryResolvers, 'series' | 'seriesd'>;
  Mutation?: Pick<MutationResolvers, 'deleteSeries' | 'createSeries' | 'editSeries'>;
  Series?: ObjectResolvers;
}

export interface StoryResolvers {
  Story?: ObjectResolvers;
}

export interface Resolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Node?: ObjectResolvers;
  Publisher?: ObjectResolvers;
  Series?: ObjectResolvers;
  Issue?: ObjectResolvers;
  Story?: ObjectResolvers;
  Cover?: ObjectResolvers;
  Arc?: ObjectResolvers;
  Individual?: ObjectResolvers;
  Appearance?: ObjectResolvers;
  Feature?: ObjectResolvers;
  User?: ObjectResolvers;
}
