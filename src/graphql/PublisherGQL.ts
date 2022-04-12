import {Publisher} from '../database/Publisher';
import {Issue} from '../database/Issue';
import {gql} from 'apollo-server';
import {PublisherService} from '../service/PublisherService';
import {Series} from '../database/Series';
import {resolvePublisher} from './Resolver';

const service: PublisherService = new PublisherService();

export const typeDef = gql`
  extend type Mutation {
    deletePublisher(item: PublisherInput!): Boolean
    createPublisher(item: PublisherInput!): Publisher
    editPublisher(old: PublisherInput!, item: PublisherInput!): Publisher
  }

  extend type Query {
    publishers(
      pattern: String
      us: Boolean!
      offset: Int!
      filter: Filter
    ): [Publisher]
    publisher(publisher: PublisherInput!): Publisher
  }

  input PublisherInput {
    id: Int
    name: String
    us: Boolean
    addinfo: String
    startyear: Int
    endyear: Int
  }

  type Publisher {
    id: Int
    name: String
    series: [Series]
    us: Boolean
    seriesCount: Int
    issueCount: Int
    firstIssue: Issue
    lastEdited: [Issue]
    lastIssue: Issue
    startyear: Int
    endyear: Int
    active: Boolean
    addinfo: String
  }
`;

export const resolvers = {
  Publisher: {
    id: (parent: Publisher): number => parent.id,
    name: (parent: Publisher): string => parent.name,
    us: (parent: Publisher): boolean => parent.us === 1,
    series: (parent: Publisher): Series[] => parent.series,
    seriesCount: async (parent: Publisher): Promise<number> =>
      await parent.seriesCount(),
    issueCount: async (parent: Publisher): Promise<number> =>
      await parent.issueCount(),
    firstIssue: async (parent: Publisher): Promise<Issue> =>
      await parent.firstIssue(),
    lastIssue: async (parent: Publisher): Promise<Issue> =>
      await parent.lastIssue(),
    startyear: (parent: Publisher): number | undefined => parent.startyear,
    endyear: (parent: Publisher): number | undefined => parent.endyear,
    active: (parent: Publisher): boolean =>
      !(parent.startyear && parent.endyear),
    addinfo: (parent: Publisher): string | undefined => parent.addinfo,
  },
  Query: {
    publishers: async (
      _: void,
      {
        pattern,
        us,
        offset,
        filter,
      }: {pattern: string; us: boolean; offset: number; filter: string}
    ): Promise<Publisher[]> => {
      return await service.getPublishers(pattern, us, offset, filter);
    },
    publisher: async (_: void, {publisher}: {publisher: Publisher}) =>
      await service.getPublisherDetails(await resolvePublisher(publisher)),
  } /*, TODO
    Mutation: {
        deletePublisher: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let pub = await models.OldPublisher.findOne({
                    where: {name: item.name.trim()},
                    transaction
                });

                let del = await pub.delete(transaction);

                await transaction.commit();
                return del !== null;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        createPublisher: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await create(item, transaction);

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        editPublisher: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await models.OldPublisher.findOne({
                    where: {
                        name: old.name.trim(),
                    },
                    transaction
                });

                res.name = item.name.trim();
                res.addinfo = item.addinfo;
                res.startyear = item.startyear;
                res.endyear = item.endyear;
                res = await res.save({transaction: transaction});

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },*/,
};
