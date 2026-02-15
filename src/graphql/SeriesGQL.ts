import {Series} from '../database/Series';
import {Issue} from '../database/Issue';
import {Publisher} from '../database/Publisher';
import {gql} from 'apollo-server';
import {SeriesService} from '../service/SeriesService';
import {resolvePublisher, resolveSeries} from './Resolver';

const service = new SeriesService();

export const typeDef = gql`
  extend type Mutation {
    deleteSeries(item: SeriesInput!): Boolean
    createSeries(item: SeriesInput!): Series
    editSeries(old: SeriesInput!, item: SeriesInput!): Series
  }

  extend type Query {
    series(
      pattern: String
      publisher: PublisherInput!
      offset: Int
      filter: Filter
    ): [Series]
    seriesd(series: SeriesInput!): Series
  }

  input SeriesInput {
    id: String
    title: String
    startyear: Int
    endyear: Int
    volume: Int
    addinfo: String
    publisher: PublisherInput
  }

  type Series {
    id: Int
    title: String
    startyear: Int
    endyear: Int
    volume: Int
    genre: String
    issues: [Issue]
    issueCount: Int
    firstIssue: Issue
    lastIssue: Issue
    lastEdited: [Issue]
    active: Boolean
    addinfo: String
    publisher: Publisher
  }
`;

export const resolvers = {
  Series: {
    id: (parent: Series): number => parent.id,
    title: (parent: Series): string => parent.title,
    startyear: (parent: Series): number | undefined => parent.startyear,
    endyear: (parent: Series): number | undefined => parent.endyear,
    volume: (parent: Series): number => parent.volume,
    addinfo: (parent: Series): string => parent.addinfo,
    genre: (parent: Series): string | undefined => parent.genre,
    issues: (parent: Series): Issue[] => parent.issues,
    issueCount: async (parent: Series): Promise<number> =>
      await parent.issueCount(),
    firstIssue: async (parent: Series): Promise<Issue> =>
      await parent.firstIssue(),
    lastIssue: async (parent: Series): Promise<Issue> =>
      await parent.lastIssue(),
    active: (parent: Series): boolean => !(parent.startyear && parent.endyear),
    publisher: async (parent: Series): Promise<Publisher> =>
      await parent.publisher,
  },
  Query: {
    series: async (
      _: void,
      {
        pattern,
        publisher,
        offset,
        filter,
      }: {pattern: string; publisher: Publisher; offset: number; filter: string}
    ): Promise<Series[]> => {
      return await service.getSeries(
        pattern,
        await resolvePublisher(publisher),
        offset,
        filter
      );
    },
    seriesd: async (_: void, {series}: {series: Series}) =>
      await service.getSeriesDetails(await resolveSeries(series)),
  } /*,TODO
    Mutation: {
        deleteSeries: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let pub = await models.OldPublisher.findOne({
                    where: {
                        name: item.publisher.name.trim()
                    },
                    transaction
                });

                let series = await models.OldSeries.findOne({
                    where: {title: item.title.trim(), volume: item.volume, fk_publisher: pub.id},
                    include: [models.OldPublisher],
                    transaction
                });

                let del = await series.delete(transaction);

                await transaction.commit();
                return del !== null;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        createSeries: async (_, {item}, context) => {
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
        editSeries: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let oldPub = await models.OldPublisher.findOne({
                    where: {
                        name: old.publisher.name.trim()
                    },
                    transaction
                });

                let newPub = await models.OldPublisher.findOne({
                    where: {
                        name: item.publisher.name.trim()
                    },
                    transaction
                });

                if (oldPub.original !== newPub.original)
                    throw new Error("You must not change to another publisher type");

                let res = await models.OldSeries.findOne({
                    where: {title: old.title.trim(), volume: old.volume, '$OldPublisher.name$': old.publisher.name},
                    include: [models.OldPublisher],
                    transaction
                });

                res.title = item.title.trim();
                res.volume = item.volume;
                res.startyear = item.startyear;
                res.endyear = item.endyear;
                res.addinfo = item.addinfo;
                res.setPublisher(newPub, {transaction: transaction});
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
