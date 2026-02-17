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
  PublisherLastEditedArgs,
  Query,
  QueryAppsArgs,
  QueryArcsArgs,
  QueryExportArgs,
  QueryIndividualsArgs,
  QueryIssueDetailsArgs,
  QueryIssueListArgs,
  QueryLastEditedArgs,
  QueryNodesArgs,
  QueryPublisherDetailsArgs,
  QueryPublisherListArgs,
  QuerySeriesDetailsArgs,
  QuerySeriesListArgs,
  Series,
  SeriesConnection,
  SeriesInput,
  SeriesLastEditedArgs,
  Story,
  StoryInput,
  User,
} from '@loliman/shortbox-contract';
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
  Mutation,
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
type MaybePromise<T> = T | Promise<T>;

export type ResolverResult<T> =
  T extends Array<infer Item> ? Array<ResolverResult<Item>> : T extends object ? unknown : T;

type BivariantResolver<Parent, Args, Result> = {
  bivarianceHack(
    parent: Parent,
    args: Args,
    context: Context,
    info?: unknown,
  ): MaybePromise<Result>;
}['bivarianceHack'];

export type ResolverFn<Parent = unknown, Args = EmptyArgs, Result = unknown> = BivariantResolver<
  Parent,
  Args,
  Result
>;

export type ObjectResolverFields<Parent, TObject> = Partial<{
  [K in keyof TObject]-?: ResolverFn<Parent, EmptyArgs, ResolverResult<TObject[K]>>;
}>;

export type QueryResolverFields = {
  _empty: ResolverFn<unknown, EmptyArgs, ResolverResult<Query['_empty']>>;
  apps: ResolverFn<unknown, QueryAppsArgs, ResolverResult<Query['apps']>>;
  arcs: ResolverFn<unknown, QueryArcsArgs, ResolverResult<Query['arcs']>>;
  export: ResolverFn<unknown, QueryExportArgs, ResolverResult<Query['export']>>;
  individuals: ResolverFn<unknown, QueryIndividualsArgs, ResolverResult<Query['individuals']>>;
  issueDetails: ResolverFn<unknown, QueryIssueDetailsArgs, ResolverResult<Query['issueDetails']>>;
  issueList: ResolverFn<unknown, QueryIssueListArgs, ResolverResult<Query['issueList']>>;
  lastEdited: ResolverFn<unknown, QueryLastEditedArgs, ResolverResult<Query['lastEdited']>>;
  me: ResolverFn<unknown, EmptyArgs, ResolverResult<Query['me']>>;
  nodes: ResolverFn<unknown, QueryNodesArgs, ResolverResult<Query['nodes']>>;
  publisherDetails: ResolverFn<
    unknown,
    QueryPublisherDetailsArgs,
    ResolverResult<Query['publisherDetails']>
  >;
  publisherList: ResolverFn<
    unknown,
    QueryPublisherListArgs,
    ResolverResult<Query['publisherList']>
  >;
  seriesDetails: ResolverFn<
    unknown,
    QuerySeriesDetailsArgs,
    ResolverResult<Query['seriesDetails']>
  >;
  seriesList: ResolverFn<unknown, QuerySeriesListArgs, ResolverResult<Query['seriesList']>>;
};

export type MutationResolverFields = {
  _empty: ResolverFn<unknown, EmptyArgs, ResolverResult<Mutation['_empty']>>;
  createIssue: ResolverFn<
    unknown,
    MutationCreateIssueArgs,
    ResolverResult<Mutation['createIssue']>
  >;
  createPublisher: ResolverFn<
    unknown,
    MutationCreatePublisherArgs,
    ResolverResult<Mutation['createPublisher']>
  >;
  createSeries: ResolverFn<
    unknown,
    MutationCreateSeriesArgs,
    ResolverResult<Mutation['createSeries']>
  >;
  deleteIssue: ResolverFn<
    unknown,
    MutationDeleteIssueArgs,
    ResolverResult<Mutation['deleteIssue']>
  >;
  deletePublisher: ResolverFn<
    unknown,
    MutationDeletePublisherArgs,
    ResolverResult<Mutation['deletePublisher']>
  >;
  deleteSeries: ResolverFn<
    unknown,
    MutationDeleteSeriesArgs,
    ResolverResult<Mutation['deleteSeries']>
  >;
  editIssue: ResolverFn<unknown, MutationEditIssueArgs, ResolverResult<Mutation['editIssue']>>;
  editPublisher: ResolverFn<
    unknown,
    MutationEditPublisherArgs,
    ResolverResult<Mutation['editPublisher']>
  >;
  editSeries: ResolverFn<unknown, MutationEditSeriesArgs, ResolverResult<Mutation['editSeries']>>;
  login: ResolverFn<unknown, MutationLoginArgs, ResolverResult<Mutation['login']>>;
  logout: ResolverFn<unknown, EmptyArgs, ResolverResult<Mutation['logout']>>;
};

export type QueryResolvers = Partial<QueryResolverFields>;
export type MutationResolvers = Partial<MutationResolverFields>;

type PublisherObjectResolverFields = Omit<
  ObjectResolverFields<unknown, Publisher>,
  'lastEdited'
> & {
  lastEdited?: ResolverFn<
    unknown,
    PublisherLastEditedArgs,
    ResolverResult<Publisher['lastEdited']>
  >;
};

type SeriesObjectResolverFields = Omit<ObjectResolverFields<unknown, Series>, 'lastEdited'> & {
  lastEdited?: ResolverFn<unknown, SeriesLastEditedArgs, ResolverResult<Series['lastEdited']>>;
};

export interface NodeResolvers {
  Query?: Pick<QueryResolvers, 'nodes'>;
  Node?: ObjectResolverFields<unknown, Node>;
}

export interface CoverResolvers {
  Cover?: ObjectResolverFields<unknown, Cover>;
}

export interface AppearanceResolvers {
  Query?: Pick<QueryResolvers, 'apps'>;
  Appearance?: ObjectResolverFields<unknown, Appearance>;
}

export interface FeatureResolvers {
  Feature?: ObjectResolverFields<unknown, Feature>;
}

export interface ArcResolvers {
  Query?: Pick<QueryResolvers, 'arcs'>;
  Arc?: ObjectResolverFields<unknown, Arc>;
}

export interface IndividualResolvers {
  Query?: Pick<QueryResolvers, 'individuals'>;
  Individual?: ObjectResolverFields<unknown, Individual>;
}

export interface PublisherResolvers {
  Query?: Pick<QueryResolvers, 'publisherList' | 'publisherDetails'>;
  Mutation?: Pick<MutationResolvers, 'deletePublisher' | 'createPublisher' | 'editPublisher'>;
  Publisher?: PublisherObjectResolverFields;
}

export interface IssueResolvers {
  Query?: Pick<QueryResolvers, 'issueList' | 'issueDetails' | 'lastEdited'>;
  Mutation?: Pick<MutationResolvers, 'deleteIssue' | 'createIssue' | 'editIssue'>;
  Issue?: ObjectResolverFields<unknown, Issue>;
}

export interface UserResolvers {
  Query?: Pick<QueryResolvers, 'me'>;
  Mutation?: Pick<MutationResolvers, 'login' | 'logout'>;
  User?: ObjectResolverFields<unknown, User>;
}

export interface SeriesResolvers {
  Query?: Pick<QueryResolvers, 'seriesList' | 'seriesDetails'>;
  Mutation?: Pick<MutationResolvers, 'deleteSeries' | 'createSeries' | 'editSeries'>;
  Series?: SeriesObjectResolverFields;
}

export interface StoryResolvers {
  Story?: ObjectResolverFields<unknown, Story>;
}

export interface FilterResolvers {
  Query?: Pick<QueryResolvers, 'export'>;
}

export interface Resolvers {
  Query?: QueryResolvers;
  Mutation?: MutationResolvers;
  Node?: ObjectResolverFields<unknown, Node>;
  Publisher?: PublisherObjectResolverFields;
  Series?: SeriesObjectResolverFields;
  Issue?: ObjectResolverFields<unknown, Issue>;
  Story?: ObjectResolverFields<unknown, Story>;
  Cover?: ObjectResolverFields<unknown, Cover>;
  Arc?: ObjectResolverFields<unknown, Arc>;
  Individual?: ObjectResolverFields<unknown, Individual>;
  Appearance?: ObjectResolverFields<unknown, Appearance>;
  Feature?: ObjectResolverFields<unknown, Feature>;
  User?: ObjectResolverFields<unknown, User>;
}
