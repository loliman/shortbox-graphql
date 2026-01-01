import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { Context } from '../core/server';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Date: { input: any; output: any; }
  DateTime: { input: any; output: any; }
  Upload: { input: any; output: any; }
};

export type Appearance = {
  __typename?: 'Appearance';
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  role?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type AppearanceConnection = {
  __typename?: 'AppearanceConnection';
  edges?: Maybe<Array<Maybe<AppearanceEdge>>>;
  pageInfo: PageInfo;
};

export type AppearanceEdge = {
  __typename?: 'AppearanceEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<Appearance>;
};

export type AppearanceInput = {
  id?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type Arc = {
  __typename?: 'Arc';
  id?: Maybe<Scalars['ID']['output']>;
  issues?: Maybe<Array<Maybe<Issue>>>;
  title?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
};

export type ArcConnection = {
  __typename?: 'ArcConnection';
  edges?: Maybe<Array<Maybe<ArcEdge>>>;
  pageInfo: PageInfo;
};

export type ArcEdge = {
  __typename?: 'ArcEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<Arc>;
};

export type ArcInput = {
  id?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type Cover = {
  __typename?: 'Cover';
  addinfo?: Maybe<Scalars['String']['output']>;
  children?: Maybe<Array<Maybe<Cover>>>;
  exclusive?: Maybe<Scalars['Boolean']['output']>;
  firstapp?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  individuals?: Maybe<Array<Maybe<Individual>>>;
  issue?: Maybe<Issue>;
  number?: Maybe<Scalars['Int']['output']>;
  onlyapp?: Maybe<Scalars['Boolean']['output']>;
  parent?: Maybe<Cover>;
  url?: Maybe<Scalars['String']['output']>;
};

export type CoverInput = {
  addinfo?: InputMaybe<Scalars['String']['input']>;
  exclusive?: InputMaybe<Scalars['Boolean']['input']>;
  individuals?: InputMaybe<Array<InputMaybe<IndividualInput>>>;
  issue?: InputMaybe<IssueInput>;
  number: Scalars['Int']['input'];
  parent?: InputMaybe<CoverInput>;
};

export type DateFilter = {
  compare?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['Date']['input']>;
};

export type Feature = {
  __typename?: 'Feature';
  addinfo?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  individuals?: Maybe<Array<Maybe<Individual>>>;
  issue?: Maybe<Issue>;
  number?: Maybe<Scalars['Int']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type FeatureInput = {
  addinfo?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  individuals?: InputMaybe<Array<InputMaybe<IndividualInput>>>;
  number: Scalars['Int']['input'];
  title?: InputMaybe<Scalars['String']['input']>;
};

export type Filter = {
  and?: InputMaybe<Scalars['Boolean']['input']>;
  appearances?: InputMaybe<Scalars['String']['input']>;
  arcs?: InputMaybe<Scalars['String']['input']>;
  exclusive?: InputMaybe<Scalars['Boolean']['input']>;
  firstPrint?: InputMaybe<Scalars['Boolean']['input']>;
  formats?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  individuals?: InputMaybe<Array<InputMaybe<IndividualInput>>>;
  noContent?: InputMaybe<Scalars['Boolean']['input']>;
  noCover?: InputMaybe<Scalars['Boolean']['input']>;
  noPrint?: InputMaybe<Scalars['Boolean']['input']>;
  numbers?: InputMaybe<Array<InputMaybe<NumberFilter>>>;
  onlyCollected?: InputMaybe<Scalars['Boolean']['input']>;
  onlyNotCollected?: InputMaybe<Scalars['Boolean']['input']>;
  onlyOnePrint?: InputMaybe<Scalars['Boolean']['input']>;
  onlyPrint?: InputMaybe<Scalars['Boolean']['input']>;
  onlyTb?: InputMaybe<Scalars['Boolean']['input']>;
  otherOnlyTb?: InputMaybe<Scalars['Boolean']['input']>;
  publishers?: InputMaybe<Array<InputMaybe<PublisherInput>>>;
  releasedates?: InputMaybe<Array<InputMaybe<DateFilter>>>;
  reprint?: InputMaybe<Scalars['Boolean']['input']>;
  sellable?: InputMaybe<Scalars['Boolean']['input']>;
  series?: InputMaybe<Array<InputMaybe<SeriesInput>>>;
  us: Scalars['Boolean']['input'];
  withVariants?: InputMaybe<Scalars['Boolean']['input']>;
};

export type Individual = {
  __typename?: 'Individual';
  id?: Maybe<Scalars['ID']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
};

export type IndividualConnection = {
  __typename?: 'IndividualConnection';
  edges?: Maybe<Array<Maybe<IndividualEdge>>>;
  pageInfo: PageInfo;
};

export type IndividualEdge = {
  __typename?: 'IndividualEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<Individual>;
};

export type IndividualInput = {
  name?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
};

export type Issue = {
  __typename?: 'Issue';
  addinfo?: Maybe<Scalars['String']['output']>;
  arcs?: Maybe<Array<Maybe<Arc>>>;
  collected?: Maybe<Scalars['Boolean']['output']>;
  comicguideid?: Maybe<Scalars['String']['output']>;
  cover?: Maybe<Cover>;
  covers?: Maybe<Array<Maybe<Cover>>>;
  createdAt?: Maybe<Scalars['DateTime']['output']>;
  currency?: Maybe<Scalars['String']['output']>;
  features?: Maybe<Array<Maybe<Feature>>>;
  format?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  individuals?: Maybe<Array<Maybe<Individual>>>;
  isbn?: Maybe<Scalars['String']['output']>;
  limitation?: Maybe<Scalars['String']['output']>;
  number?: Maybe<Scalars['String']['output']>;
  pages?: Maybe<Scalars['Int']['output']>;
  price?: Maybe<Scalars['Float']['output']>;
  releasedate?: Maybe<Scalars['Date']['output']>;
  series?: Maybe<Series>;
  stories?: Maybe<Array<Maybe<Story>>>;
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  title?: Maybe<Scalars['String']['output']>;
  updatedAt?: Maybe<Scalars['DateTime']['output']>;
  variant?: Maybe<Scalars['String']['output']>;
  variants?: Maybe<Array<Maybe<Issue>>>;
  verified?: Maybe<Scalars['Boolean']['output']>;
};

export type IssueConnection = {
  __typename?: 'IssueConnection';
  edges?: Maybe<Array<Maybe<IssueEdge>>>;
  pageInfo: PageInfo;
};

export type IssueEdge = {
  __typename?: 'IssueEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<Issue>;
};

export type IssueInput = {
  addinfo?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  format?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  isbn?: InputMaybe<Scalars['String']['input']>;
  limitation?: InputMaybe<Scalars['String']['input']>;
  number?: InputMaybe<Scalars['String']['input']>;
  pages?: InputMaybe<Scalars['Int']['input']>;
  price?: InputMaybe<Scalars['Float']['input']>;
  releasedate?: InputMaybe<Scalars['Date']['input']>;
  series?: InputMaybe<SeriesInput>;
  title?: InputMaybe<Scalars['String']['input']>;
  variant?: InputMaybe<Scalars['String']['input']>;
};

export type Mutation = {
  __typename?: 'Mutation';
  _empty?: Maybe<Scalars['String']['output']>;
  crawlIssue?: Maybe<Issue>;
  createIssue?: Maybe<Issue>;
  createPublisher?: Maybe<Publisher>;
  createSeries?: Maybe<Series>;
  deleteIssue?: Maybe<Scalars['Boolean']['output']>;
  deletePublisher?: Maybe<Scalars['Boolean']['output']>;
  deleteSeries?: Maybe<Scalars['Boolean']['output']>;
  editIssue?: Maybe<Issue>;
  editPublisher?: Maybe<Publisher>;
  editSeries?: Maybe<Series>;
  login?: Maybe<User>;
  logout?: Maybe<Scalars['Boolean']['output']>;
  uploadCover?: Maybe<Scalars['Boolean']['output']>;
};


export type MutationCrawlIssueArgs = {
  number: Scalars['String']['input'];
  title: Scalars['String']['input'];
  volume: Scalars['Int']['input'];
};


export type MutationCreateIssueArgs = {
  item: IssueInput;
};


export type MutationCreatePublisherArgs = {
  item: PublisherInput;
};


export type MutationCreateSeriesArgs = {
  item: SeriesInput;
};


export type MutationDeleteIssueArgs = {
  item: IssueInput;
};


export type MutationDeletePublisherArgs = {
  item: PublisherInput;
};


export type MutationDeleteSeriesArgs = {
  item: SeriesInput;
};


export type MutationEditIssueArgs = {
  item: IssueInput;
  old: IssueInput;
};


export type MutationEditPublisherArgs = {
  item: PublisherInput;
  old: PublisherInput;
};


export type MutationEditSeriesArgs = {
  item: SeriesInput;
  old: SeriesInput;
};


export type MutationLoginArgs = {
  user: UserInput;
};


export type MutationLogoutArgs = {
  user: UserInput;
};


export type MutationUploadCoverArgs = {
  file: Scalars['Upload']['input'];
  issue: IssueInput;
};

export type NumberFilter = {
  compare?: InputMaybe<Scalars['String']['input']>;
  number?: InputMaybe<Scalars['String']['input']>;
  variant?: InputMaybe<Scalars['String']['input']>;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Publisher = {
  __typename?: 'Publisher';
  active?: Maybe<Scalars['Boolean']['output']>;
  addinfo?: Maybe<Scalars['String']['output']>;
  endyear?: Maybe<Scalars['Int']['output']>;
  firstIssue?: Maybe<Issue>;
  id?: Maybe<Scalars['ID']['output']>;
  issueCount?: Maybe<Scalars['Int']['output']>;
  lastEdited?: Maybe<Array<Maybe<Issue>>>;
  lastIssue?: Maybe<Issue>;
  name?: Maybe<Scalars['String']['output']>;
  series?: Maybe<Array<Maybe<Series>>>;
  seriesCount?: Maybe<Scalars['Int']['output']>;
  startyear?: Maybe<Scalars['Int']['output']>;
  us?: Maybe<Scalars['Boolean']['output']>;
};


export type PublisherLastEditedArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type PublisherConnection = {
  __typename?: 'PublisherConnection';
  edges?: Maybe<Array<Maybe<PublisherEdge>>>;
  pageInfo: PageInfo;
};

export type PublisherEdge = {
  __typename?: 'PublisherEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<Publisher>;
};

export type PublisherInput = {
  addinfo?: InputMaybe<Scalars['String']['input']>;
  endyear?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  startyear?: InputMaybe<Scalars['Int']['input']>;
  us?: InputMaybe<Scalars['Boolean']['input']>;
};

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']['output']>;
  apps?: Maybe<AppearanceConnection>;
  arcs?: Maybe<ArcConnection>;
  export?: Maybe<Scalars['String']['output']>;
  individuals?: Maybe<IndividualConnection>;
  issue?: Maybe<Issue>;
  issues?: Maybe<IssueConnection>;
  lastEdited?: Maybe<Array<Maybe<Issue>>>;
  publisher?: Maybe<Publisher>;
  publishers?: Maybe<PublisherConnection>;
  series?: Maybe<SeriesConnection>;
  seriesd?: Maybe<Series>;
};


export type QueryAppsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryArcsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type QueryExportArgs = {
  filter: Filter;
  type: Scalars['String']['input'];
};


export type QueryIndividualsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
};


export type QueryIssueArgs = {
  edit?: InputMaybe<Scalars['Boolean']['input']>;
  issue: IssueInput;
};


export type QueryIssuesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<Filter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
  series: SeriesInput;
};


export type QueryLastEditedArgs = {
  direction?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<Filter>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  order?: InputMaybe<Scalars['String']['input']>;
};


export type QueryPublisherArgs = {
  publisher: PublisherInput;
};


export type QueryPublishersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<Filter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
  us: Scalars['Boolean']['input'];
};


export type QuerySeriesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<Filter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  pattern?: InputMaybe<Scalars['String']['input']>;
  publisher: PublisherInput;
};


export type QuerySeriesdArgs = {
  series: SeriesInput;
};

export type Series = {
  __typename?: 'Series';
  active?: Maybe<Scalars['Boolean']['output']>;
  addinfo?: Maybe<Scalars['String']['output']>;
  endyear?: Maybe<Scalars['Int']['output']>;
  firstIssue?: Maybe<Issue>;
  id?: Maybe<Scalars['ID']['output']>;
  issueCount?: Maybe<Scalars['Int']['output']>;
  lastEdited?: Maybe<Array<Maybe<Issue>>>;
  lastIssue?: Maybe<Issue>;
  publisher?: Maybe<Publisher>;
  startyear?: Maybe<Scalars['Int']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  volume?: Maybe<Scalars['Int']['output']>;
};


export type SeriesLastEditedArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
};

export type SeriesConnection = {
  __typename?: 'SeriesConnection';
  edges?: Maybe<Array<Maybe<SeriesEdge>>>;
  pageInfo: PageInfo;
};

export type SeriesEdge = {
  __typename?: 'SeriesEdge';
  cursor: Scalars['String']['output'];
  node?: Maybe<Series>;
};

export type SeriesInput = {
  addinfo?: InputMaybe<Scalars['String']['input']>;
  endyear?: InputMaybe<Scalars['Int']['input']>;
  id?: InputMaybe<Scalars['String']['input']>;
  publisher?: InputMaybe<PublisherInput>;
  startyear?: InputMaybe<Scalars['Int']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  volume?: InputMaybe<Scalars['Int']['input']>;
};

export type Story = {
  __typename?: 'Story';
  addinfo?: Maybe<Scalars['String']['output']>;
  appearances?: Maybe<Array<Maybe<Appearance>>>;
  children?: Maybe<Array<Maybe<Story>>>;
  collected?: Maybe<Scalars['Boolean']['output']>;
  collectedmultipletimes?: Maybe<Scalars['Boolean']['output']>;
  exclusive?: Maybe<Scalars['Boolean']['output']>;
  firstapp?: Maybe<Scalars['Boolean']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  individuals?: Maybe<Array<Maybe<Individual>>>;
  issue?: Maybe<Issue>;
  number?: Maybe<Scalars['Int']['output']>;
  onlyapp?: Maybe<Scalars['Boolean']['output']>;
  onlyoneprint?: Maybe<Scalars['Boolean']['output']>;
  onlytb?: Maybe<Scalars['Boolean']['output']>;
  otheronlytb?: Maybe<Scalars['Boolean']['output']>;
  parent?: Maybe<Story>;
  part?: Maybe<Scalars['String']['output']>;
  reprintOf?: Maybe<Story>;
  reprints?: Maybe<Array<Maybe<Story>>>;
  title?: Maybe<Scalars['String']['output']>;
};

export type StoryInput = {
  addinfo?: InputMaybe<Scalars['String']['input']>;
  appearances?: InputMaybe<Array<InputMaybe<AppearanceInput>>>;
  collected?: InputMaybe<Scalars['Boolean']['input']>;
  exclusive?: InputMaybe<Scalars['Boolean']['input']>;
  firstapp?: InputMaybe<Scalars['Boolean']['input']>;
  individuals?: InputMaybe<Array<InputMaybe<IndividualInput>>>;
  issue?: InputMaybe<IssueInput>;
  number: Scalars['Int']['input'];
  onlyapp?: InputMaybe<Scalars['Boolean']['input']>;
  onlyoneprint?: InputMaybe<Scalars['Boolean']['input']>;
  onlytb?: InputMaybe<Scalars['Boolean']['input']>;
  otheronlytb?: InputMaybe<Scalars['Boolean']['input']>;
  parent?: InputMaybe<StoryInput>;
  part?: InputMaybe<Scalars['String']['input']>;
  reprintOf?: InputMaybe<StoryInput>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  id?: Maybe<Scalars['ID']['output']>;
  sessionid?: Maybe<Scalars['String']['output']>;
};

export type UserInput = {
  id?: InputMaybe<Scalars['Int']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  sessionid?: InputMaybe<Scalars['String']['input']>;
};

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  Appearance: ResolverTypeWrapper<Appearance>;
  AppearanceConnection: ResolverTypeWrapper<AppearanceConnection>;
  AppearanceEdge: ResolverTypeWrapper<AppearanceEdge>;
  AppearanceInput: AppearanceInput;
  Arc: ResolverTypeWrapper<Arc>;
  ArcConnection: ResolverTypeWrapper<ArcConnection>;
  ArcEdge: ResolverTypeWrapper<ArcEdge>;
  ArcInput: ArcInput;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Cover: ResolverTypeWrapper<Cover>;
  CoverInput: CoverInput;
  Date: ResolverTypeWrapper<Scalars['Date']['output']>;
  DateFilter: DateFilter;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  Feature: ResolverTypeWrapper<Feature>;
  FeatureInput: FeatureInput;
  Filter: Filter;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Individual: ResolverTypeWrapper<Individual>;
  IndividualConnection: ResolverTypeWrapper<IndividualConnection>;
  IndividualEdge: ResolverTypeWrapper<IndividualEdge>;
  IndividualInput: IndividualInput;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Issue: ResolverTypeWrapper<Issue>;
  IssueConnection: ResolverTypeWrapper<IssueConnection>;
  IssueEdge: ResolverTypeWrapper<IssueEdge>;
  IssueInput: IssueInput;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  NumberFilter: NumberFilter;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  Publisher: ResolverTypeWrapper<Publisher>;
  PublisherConnection: ResolverTypeWrapper<PublisherConnection>;
  PublisherEdge: ResolverTypeWrapper<PublisherEdge>;
  PublisherInput: PublisherInput;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  Series: ResolverTypeWrapper<Series>;
  SeriesConnection: ResolverTypeWrapper<SeriesConnection>;
  SeriesEdge: ResolverTypeWrapper<SeriesEdge>;
  SeriesInput: SeriesInput;
  Story: ResolverTypeWrapper<Story>;
  StoryInput: StoryInput;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Upload: ResolverTypeWrapper<Scalars['Upload']['output']>;
  User: ResolverTypeWrapper<User>;
  UserInput: UserInput;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  Appearance: Appearance;
  AppearanceConnection: AppearanceConnection;
  AppearanceEdge: AppearanceEdge;
  AppearanceInput: AppearanceInput;
  Arc: Arc;
  ArcConnection: ArcConnection;
  ArcEdge: ArcEdge;
  ArcInput: ArcInput;
  Boolean: Scalars['Boolean']['output'];
  Cover: Cover;
  CoverInput: CoverInput;
  Date: Scalars['Date']['output'];
  DateFilter: DateFilter;
  DateTime: Scalars['DateTime']['output'];
  Feature: Feature;
  FeatureInput: FeatureInput;
  Filter: Filter;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Individual: Individual;
  IndividualConnection: IndividualConnection;
  IndividualEdge: IndividualEdge;
  IndividualInput: IndividualInput;
  Int: Scalars['Int']['output'];
  Issue: Issue;
  IssueConnection: IssueConnection;
  IssueEdge: IssueEdge;
  IssueInput: IssueInput;
  Mutation: Record<PropertyKey, never>;
  NumberFilter: NumberFilter;
  PageInfo: PageInfo;
  Publisher: Publisher;
  PublisherConnection: PublisherConnection;
  PublisherEdge: PublisherEdge;
  PublisherInput: PublisherInput;
  Query: Record<PropertyKey, never>;
  Series: Series;
  SeriesConnection: SeriesConnection;
  SeriesEdge: SeriesEdge;
  SeriesInput: SeriesInput;
  Story: Story;
  StoryInput: StoryInput;
  String: Scalars['String']['output'];
  Upload: Scalars['Upload']['output'];
  User: User;
  UserInput: UserInput;
}>;

export type AppearanceResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Appearance'] = ResolversParentTypes['Appearance']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  role?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type AppearanceConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AppearanceConnection'] = ResolversParentTypes['AppearanceConnection']> = ResolversObject<{
  edges?: Resolver<Maybe<Array<Maybe<ResolversTypes['AppearanceEdge']>>>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
}>;

export type AppearanceEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['AppearanceEdge'] = ResolversParentTypes['AppearanceEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Appearance']>, ParentType, ContextType>;
}>;

export type ArcResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Arc'] = ResolversParentTypes['Arc']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  issues?: Resolver<Maybe<Array<Maybe<ResolversTypes['Issue']>>>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type ArcConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ArcConnection'] = ResolversParentTypes['ArcConnection']> = ResolversObject<{
  edges?: Resolver<Maybe<Array<Maybe<ResolversTypes['ArcEdge']>>>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
}>;

export type ArcEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ArcEdge'] = ResolversParentTypes['ArcEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Arc']>, ParentType, ContextType>;
}>;

export type CoverResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Cover'] = ResolversParentTypes['Cover']> = ResolversObject<{
  addinfo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  children?: Resolver<Maybe<Array<Maybe<ResolversTypes['Cover']>>>, ParentType, ContextType>;
  exclusive?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  firstapp?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  individuals?: Resolver<Maybe<Array<Maybe<ResolversTypes['Individual']>>>, ParentType, ContextType>;
  issue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  number?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  onlyapp?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  parent?: Resolver<Maybe<ResolversTypes['Cover']>, ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export interface DateScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Date'], any> {
  name: 'Date';
}

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type FeatureResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Feature'] = ResolversParentTypes['Feature']> = ResolversObject<{
  addinfo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  individuals?: Resolver<Maybe<Array<Maybe<ResolversTypes['Individual']>>>, ParentType, ContextType>;
  issue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  number?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type IndividualResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Individual'] = ResolversParentTypes['Individual']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<Maybe<Array<Maybe<ResolversTypes['String']>>>, ParentType, ContextType>;
}>;

export type IndividualConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['IndividualConnection'] = ResolversParentTypes['IndividualConnection']> = ResolversObject<{
  edges?: Resolver<Maybe<Array<Maybe<ResolversTypes['IndividualEdge']>>>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
}>;

export type IndividualEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['IndividualEdge'] = ResolversParentTypes['IndividualEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Individual']>, ParentType, ContextType>;
}>;

export type IssueResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Issue'] = ResolversParentTypes['Issue']> = ResolversObject<{
  addinfo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  arcs?: Resolver<Maybe<Array<Maybe<ResolversTypes['Arc']>>>, ParentType, ContextType>;
  collected?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  comicguideid?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  cover?: Resolver<Maybe<ResolversTypes['Cover']>, ParentType, ContextType>;
  covers?: Resolver<Maybe<Array<Maybe<ResolversTypes['Cover']>>>, ParentType, ContextType>;
  createdAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  currency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  features?: Resolver<Maybe<Array<Maybe<ResolversTypes['Feature']>>>, ParentType, ContextType>;
  format?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  individuals?: Resolver<Maybe<Array<Maybe<ResolversTypes['Individual']>>>, ParentType, ContextType>;
  isbn?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  limitation?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  number?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  pages?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  price?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  releasedate?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  series?: Resolver<Maybe<ResolversTypes['Series']>, ParentType, ContextType>;
  stories?: Resolver<Maybe<Array<Maybe<ResolversTypes['Story']>>>, ParentType, ContextType>;
  tags?: Resolver<Maybe<Array<Maybe<ResolversTypes['String']>>>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  variant?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  variants?: Resolver<Maybe<Array<Maybe<ResolversTypes['Issue']>>>, ParentType, ContextType>;
  verified?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
}>;

export type IssueConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['IssueConnection'] = ResolversParentTypes['IssueConnection']> = ResolversObject<{
  edges?: Resolver<Maybe<Array<Maybe<ResolversTypes['IssueEdge']>>>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
}>;

export type IssueEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['IssueEdge'] = ResolversParentTypes['IssueEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
}>;

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  crawlIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType, RequireFields<MutationCrawlIssueArgs, 'number' | 'title' | 'volume'>>;
  createIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType, RequireFields<MutationCreateIssueArgs, 'item'>>;
  createPublisher?: Resolver<Maybe<ResolversTypes['Publisher']>, ParentType, ContextType, RequireFields<MutationCreatePublisherArgs, 'item'>>;
  createSeries?: Resolver<Maybe<ResolversTypes['Series']>, ParentType, ContextType, RequireFields<MutationCreateSeriesArgs, 'item'>>;
  deleteIssue?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteIssueArgs, 'item'>>;
  deletePublisher?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeletePublisherArgs, 'item'>>;
  deleteSeries?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationDeleteSeriesArgs, 'item'>>;
  editIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType, RequireFields<MutationEditIssueArgs, 'item' | 'old'>>;
  editPublisher?: Resolver<Maybe<ResolversTypes['Publisher']>, ParentType, ContextType, RequireFields<MutationEditPublisherArgs, 'item' | 'old'>>;
  editSeries?: Resolver<Maybe<ResolversTypes['Series']>, ParentType, ContextType, RequireFields<MutationEditSeriesArgs, 'item' | 'old'>>;
  login?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType, RequireFields<MutationLoginArgs, 'user'>>;
  logout?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationLogoutArgs, 'user'>>;
  uploadCover?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType, RequireFields<MutationUploadCoverArgs, 'file' | 'issue'>>;
}>;

export type PageInfoResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = ResolversObject<{
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type PublisherResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Publisher'] = ResolversParentTypes['Publisher']> = ResolversObject<{
  active?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  addinfo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  endyear?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  firstIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  issueCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lastEdited?: Resolver<Maybe<Array<Maybe<ResolversTypes['Issue']>>>, ParentType, ContextType, Partial<PublisherLastEditedArgs>>;
  lastIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  series?: Resolver<Maybe<Array<Maybe<ResolversTypes['Series']>>>, ParentType, ContextType>;
  seriesCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  startyear?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  us?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
}>;

export type PublisherConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublisherConnection'] = ResolversParentTypes['PublisherConnection']> = ResolversObject<{
  edges?: Resolver<Maybe<Array<Maybe<ResolversTypes['PublisherEdge']>>>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
}>;

export type PublisherEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PublisherEdge'] = ResolversParentTypes['PublisherEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Publisher']>, ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  apps?: Resolver<Maybe<ResolversTypes['AppearanceConnection']>, ParentType, ContextType, Partial<QueryAppsArgs>>;
  arcs?: Resolver<Maybe<ResolversTypes['ArcConnection']>, ParentType, ContextType, Partial<QueryArcsArgs>>;
  export?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QueryExportArgs, 'filter' | 'type'>>;
  individuals?: Resolver<Maybe<ResolversTypes['IndividualConnection']>, ParentType, ContextType, Partial<QueryIndividualsArgs>>;
  issue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType, RequireFields<QueryIssueArgs, 'issue'>>;
  issues?: Resolver<Maybe<ResolversTypes['IssueConnection']>, ParentType, ContextType, RequireFields<QueryIssuesArgs, 'series'>>;
  lastEdited?: Resolver<Maybe<Array<Maybe<ResolversTypes['Issue']>>>, ParentType, ContextType, Partial<QueryLastEditedArgs>>;
  publisher?: Resolver<Maybe<ResolversTypes['Publisher']>, ParentType, ContextType, RequireFields<QueryPublisherArgs, 'publisher'>>;
  publishers?: Resolver<Maybe<ResolversTypes['PublisherConnection']>, ParentType, ContextType, RequireFields<QueryPublishersArgs, 'us'>>;
  series?: Resolver<Maybe<ResolversTypes['SeriesConnection']>, ParentType, ContextType, RequireFields<QuerySeriesArgs, 'publisher'>>;
  seriesd?: Resolver<Maybe<ResolversTypes['Series']>, ParentType, ContextType, RequireFields<QuerySeriesdArgs, 'series'>>;
}>;

export type SeriesResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Series'] = ResolversParentTypes['Series']> = ResolversObject<{
  active?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  addinfo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  endyear?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  firstIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  issueCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  lastEdited?: Resolver<Maybe<Array<Maybe<ResolversTypes['Issue']>>>, ParentType, ContextType, Partial<SeriesLastEditedArgs>>;
  lastIssue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  publisher?: Resolver<Maybe<ResolversTypes['Publisher']>, ParentType, ContextType>;
  startyear?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  volume?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
}>;

export type SeriesConnectionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SeriesConnection'] = ResolversParentTypes['SeriesConnection']> = ResolversObject<{
  edges?: Resolver<Maybe<Array<Maybe<ResolversTypes['SeriesEdge']>>>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
}>;

export type SeriesEdgeResolvers<ContextType = Context, ParentType extends ResolversParentTypes['SeriesEdge'] = ResolversParentTypes['SeriesEdge']> = ResolversObject<{
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<Maybe<ResolversTypes['Series']>, ParentType, ContextType>;
}>;

export type StoryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Story'] = ResolversParentTypes['Story']> = ResolversObject<{
  addinfo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  appearances?: Resolver<Maybe<Array<Maybe<ResolversTypes['Appearance']>>>, ParentType, ContextType>;
  children?: Resolver<Maybe<Array<Maybe<ResolversTypes['Story']>>>, ParentType, ContextType>;
  collected?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  collectedmultipletimes?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  exclusive?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  firstapp?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  individuals?: Resolver<Maybe<Array<Maybe<ResolversTypes['Individual']>>>, ParentType, ContextType>;
  issue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>;
  number?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  onlyapp?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  onlyoneprint?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  onlytb?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  otheronlytb?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  parent?: Resolver<Maybe<ResolversTypes['Story']>, ParentType, ContextType>;
  part?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  reprintOf?: Resolver<Maybe<ResolversTypes['Story']>, ParentType, ContextType>;
  reprints?: Resolver<Maybe<Array<Maybe<ResolversTypes['Story']>>>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export interface UploadScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Upload'], any> {
  name: 'Upload';
}

export type UserResolvers<ContextType = Context, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = ResolversObject<{
  id?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  sessionid?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
}>;

export type Resolvers<ContextType = Context> = ResolversObject<{
  Appearance?: AppearanceResolvers<ContextType>;
  AppearanceConnection?: AppearanceConnectionResolvers<ContextType>;
  AppearanceEdge?: AppearanceEdgeResolvers<ContextType>;
  Arc?: ArcResolvers<ContextType>;
  ArcConnection?: ArcConnectionResolvers<ContextType>;
  ArcEdge?: ArcEdgeResolvers<ContextType>;
  Cover?: CoverResolvers<ContextType>;
  Date?: GraphQLScalarType;
  DateTime?: GraphQLScalarType;
  Feature?: FeatureResolvers<ContextType>;
  Individual?: IndividualResolvers<ContextType>;
  IndividualConnection?: IndividualConnectionResolvers<ContextType>;
  IndividualEdge?: IndividualEdgeResolvers<ContextType>;
  Issue?: IssueResolvers<ContextType>;
  IssueConnection?: IssueConnectionResolvers<ContextType>;
  IssueEdge?: IssueEdgeResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Publisher?: PublisherResolvers<ContextType>;
  PublisherConnection?: PublisherConnectionResolvers<ContextType>;
  PublisherEdge?: PublisherEdgeResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Series?: SeriesResolvers<ContextType>;
  SeriesConnection?: SeriesConnectionResolvers<ContextType>;
  SeriesEdge?: SeriesEdgeResolvers<ContextType>;
  Story?: StoryResolvers<ContextType>;
  Upload?: GraphQLScalarType;
  User?: UserResolvers<ContextType>;
}>;

