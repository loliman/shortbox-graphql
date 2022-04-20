import {Issue} from '../database/Issue';
import {Series} from '../database/Series';
import {Individual} from '../database/Individual';
import {Arc} from '../database/Arc';
import {Cover} from '../database/Cover';
import {Story} from '../database/Story';
import {Feature} from '../database/Feature';
import {gql} from 'apollo-server';
import {IssueService} from '../service/IssueService';
import {resolveIssue, resolveSeries} from './Resolver';

const service = new IssueService();

export const typeDef = gql`
  extend type Mutation {
    deleteIssue(item: IssueInput!): Boolean
    createIssue(item: IssueInput!): Issue
    editIssue(old: IssueInput!, item: IssueInput!): Issue
    verifyIssue(item: IssueInput!): Issue
  }

  extend type Query {
    issues(series: SeriesInput!, offset: Int, filter: Filter): [Issue]
    lastEdited(filter: Filter, offset: Int): [Issue]
    issue(issue: IssueInput!, edit: Boolean): Issue
  }

  input IssueInput {
    id: String
    title: String
    series: SeriesInput!
    number: String!
    format: String!
    variant: String
    limitation: Int
    cover: Upload
    pages: Int
    releasedate: Date
    price: String
    currency: String
    individuals: [IndividualInput]
    addinfo: String
    stories: [StoryInput]
    features: [FeatureInput]
    covers: [CoverInput]
    arcs: [ArcInput]
  }

  type Issue {
    id: Int
    format: String
    limitation: Int
    cover: Cover
    price: String
    currency: String
    title: String
    number: String
    series: Series
    pages: Int
    releasedate: Date
    arcs: [Arc]
    features: [Feature]
    stories: [Story]
    covers: [Cover]
    variants: [Issue]
    variant: String
    verified: Boolean
    edited: Boolean
    addinfo: String
    individuals: [Individual]
    createdAt: DateTime
    updatedAt: DateTime
    next: Issue
    previous: Issue
  }
`;

export const resolvers = {
  Issue: {
    id: (parent: Issue): number => parent.id,
    title: (parent: Issue): string => parent.title,
    number: (parent: Issue): string => parent.number,
    format: (parent: Issue): string => parent.format,
    series: (parent: Issue): Series => parent.series,
    variants: async (parent: Issue): Promise<Issue[]> =>
      await service.getVariants(parent),
    variant: (parent: Issue): string | undefined => parent.variant,
    features: (parent: Issue): Feature[] => parent.features,
    stories: (parent: Issue): Story[] => parent.stories,
    limitation: (parent: Issue): number | undefined => parent.limitation,
    cover: (parent: Issue): Cover => parent.cover,
    covers: (parent: Issue): Cover[] => (parent.covers ? parent.covers : []),
    price: (parent: Issue): number | undefined => parent.price,
    currency: (parent: Issue): string | undefined => parent.currency,
    pages: (parent: Issue): number | undefined => parent.pages,
    releasedate: (parent: Issue): Date | undefined =>
      new Date(parent.releasedate),
    verified: (parent: Issue): number | undefined => parent.verified,
    edited: (parent: Issue): number | undefined => parent.edited,
    addinfo: (parent: Issue): string => parent.addinfo,
    arcs: (parent: Issue): Arc[] => parent.arcs,
    individuals: (parent: Issue): Individual[] => parent.individuals,
    createdAt: (parent: Issue): Date => new Date(parent.createdAt),
    updatedAt: (parent: Issue): Date => new Date(parent.updatedAt),
    next: async (parent: Issue): Promise<Issue | null> =>
      await service.getNextIssue(parent),
    previous: async (parent: Issue): Promise<Issue | null> =>
      await service.getPreviousIssue(parent),
  },
  Query: {
    issues: async (
      _: void,
      {series, offset, filter}: {series: Series; offset: number; filter: string}
    ): Promise<Issue[]> =>
      await service.getIssues(await resolveSeries(series), offset, filter),
    issue: async (
      _: void,
      {issue, edit}: {issue: Issue; edit: boolean}
    ): Promise<Issue> =>
      service.getIssueDetails(await resolveIssue(issue), edit),
    lastEdited: async (
      _: void,
      {filter, offset}: {filter: string; offset: number}
    ): Promise<Issue[]> => await service.getLastEdited(filter, offset),
  } /*,
    Mutation: {
        deleteIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let series = await models.OldSeries.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$OldPublisher.name$': item.series.publisher.name.trim()
                    },
                    include: [models.OldPublisher],
                    transaction
                });

                let where = {
                    number: item.number.trim(),
                    fk_series: series.id
                };

                if (item.format)
                    where.format = item.format.trim();

                if (item.variant)
                    where.variant = item.variant.trim();

                let issue = await models.OldIssue.findOne({
                    where: where,
                    transaction
                });

                let oldStories = await issue.getStories();
                let oldCovers = await issue.getCovers();

                let del = await issue.delete(transaction);
                await transaction.commit();

                await update(oldStories, oldCovers);

                return del !== null;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        createIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await create(item, transaction);

                await transaction.commit();

                update(await res.getStories(), await res.getCovers());
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        editIssue: async (_, {old, item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let oldPub = await models.OldPublisher.findOne({
                    where: {
                        name: old.series.publisher.name.trim()
                    },
                    transaction
                });

                let newPub = await models.OldPublisher.findOne({
                    where: {
                        name: old.series.publisher.name.trim()
                    },
                    transaction
                });

                if (oldPub.original !== newPub.original)
                    throw new Error("You must not change to another publisher type");

                let where = {
                    number: old.number.trim(),
                    '$OldSeries.title$': old.series.title.trim(),
                    '$OldSeries.volume$': old.series.volume,
                    '$OldSeries->OldPublisher.name$': old.series.publisher.name.trim()
                };

                if (old.format)
                    where.format = old.format.trim();

                if (old.variant)
                    where.variant = old.variant.trim();

                let newSeries = await models.OldSeries.findOne({
                    where: {
                        title: item.series.title.trim(),
                        volume: item.series.volume,
                        '$OldPublisher.name$': item.series.publisher.name.trim()
                    },
                    include: [models.OldPublisher],
                    transaction
                });

                let res = await models.OldIssue.findOne({
                    where: where,
                    include: [
                        {
                            model: models.OldSeries,
                            include: [
                                models.OldPublisher
                            ]
                        }
                    ],
                    transaction
                });

                let releasedate = item.releasedate;
                if (parseInt(releasedate.toLocaleString().substring(0, 4)) < newSeries.startyear)
                    releasedate.setFullYear(newSeries.startyear);

                res.title = item.title ? item.title.trim() : '';
                res.number = item.number.trim();
                res.setSeries(newSeries, {transaction: transaction});
                res.format = item.format ? item.format.trim() : 'Heft';
                res.variant = item.variant ? item.variant.trim() : '';
                res.limitation = item.limitation;
                res.pages = item.pages;
                res.releasedate = releasedate;
                res.price = !isNaN(item.price) && item.price !== '' ? item.price : '0';
                res.currency = item.currency ? item.currency.trim() : '';
                res.addinfo = item.addinfo;

                res = await res.save({transaction: transaction});

                let cover = await models.OldCover.findOne({where: {fk_issue: res.id, number: 0}, transaction});

                let coverUrl = '';

                if (item.cover === '') { //OldCover has been deleted
                    if (cover) {
                        if (!cover.url.indexOf('http') === 0)
                            deleteFile(cover.url);
                        await cover.destroy({transaction});
                    }
                } else if (item.cover instanceof Promise) { //OldCover has been changed
                    if (cover) {
                        if (!cover.url.indexOf('http') === 0)
                            deleteFile(cover.url);
                        await cover.destroy({transaction});
                    }

                    coverUrl = await createCoverForIssue(item.cover, item.covers, res, transaction);
                } // else nothing has changed

                let us = item.series.publisher.us;

                if (us && item.individuals.length > 0) {
                    await models.Issue_Individual.destroy({where: {fk_issue: res.id}, transaction});

                    await asyncForEach(item.individuals, async individual => {
                        if (individual.name && individual.name.trim() !== '')
                            await asyncForEach(individual.type, async type => {
                                await res.associateIndividual(individual.name.trim(), type, transaction);
                            });
                    });

                    await res.save({transaction: transaction});
                }

                if (us && item.arcs && item.arcs.length > 0) {
                    await models.Issue_Arc.destroy({where: {fk_issue: res.id}, transaction});

                    await asyncForEach(item.arcs, async arc => {
                        if (arc.title && arc.title.trim() !== '')
                            await res.associateArc(arc.title.trim(), arc.type, transaction);
                    });

                    await res.save({transaction: transaction});
                }

                let oldS = await res.getStories();
                let oldStories = await getStories(res, transaction);

                let deletedStories = oldStories.filter(o => {
                    let found = false;
                    item.stories.forEach(n => {
                        if (!found)
                            found = storyEquals(o, n);
                    });
                    return !found;
                });

                if (us)
                    deletedStories.forEach(deletedStory => {
                        if (!deletedStory.exclusive)
                            throw Error('You must not delete original stories with children');
                    });

                await asyncForEach(deletedStories, async story => {
                    let resStory = await models.StoryDto.findOne({
                        where: {
                            number: story.number,
                            fk_issue: res.id
                        },
                        transaction
                    });

                    await resStory.destroy({transaction: transaction});
                });

                let newStories = item.stories.filter(n => {
                    let found = false;
                    oldStories.forEach(o => {
                        if (!found)
                            found = storyEquals(n, o);
                    });
                    return !found;
                });

                if (item.stories) {
                    let stories = [];
                    await asyncForEach(newStories, async (story) => {
                        if (story.parent && story.parent.number === 0) {
                            let resIssue = await findOrCrawlIssue(story.parent.issue, transaction);
                            let oStories = await models.StoryDto.findAll({
                                where: {fk_issue: resIssue.id},
                                order: [['number', 'ASC']],
                                transaction
                            });

                            for (let i = 0; i < oStories.length; i++) {
                                stories.push({
                                    number: stories.length + 1,
                                    parent: {number: i + 1, issue: story.parent.issue},
                                    translators: story.translators,
                                    addinfo: '',
                                    exclusive: false
                                });
                            }
                        } else {
                            stories.push(story);
                        }
                    });

                    await asyncForEach(stories, async (story) => await createStory(story, res, transaction, us));
                }

                if (!us) {
                    let oldFeatures = await getFeatures(res, transaction);

                    let deletedFeatures = oldFeatures.filter(o => {
                        let found = false;
                        item.features.forEach(n => {
                            if (!found)
                                found = featureEquals(o, n);
                        });
                        return !found;
                    });

                    await asyncForEach(deletedFeatures, async (feature) => {
                        await models.OldFeature.destroy({
                            where: {
                                number: feature.number,
                                fk_issue: res.id
                            },
                            transaction
                        })
                    });

                    let newFeatures = item.features.filter(n => {
                        let found = false;
                        oldFeatures.forEach(o => {
                            if (!found)
                                found = featureEquals(n, o);
                        });
                        return !found;
                    });

                    await asyncForEach(newFeatures, async feature => await createFeature(feature, res, transaction));
                }

                let oldC = await res.getCovers();
                let oldCovers = await getCovers(res, transaction);

                let deletedCovers = oldCovers.filter(o => {
                    let found = false;
                    item.covers.forEach(n => {
                        if (!found)
                            found = coverEquals(o, n);
                    });

                    if (o.number === 0 && coverUrl !== '')
                        found = true;

                    return !found;
                });

                if (us)
                    deletedCovers.forEach(deletedCover => {
                        if (!deletedCover.exclusive)
                            throw Error('You must not delete original covers with children');
                    });

                await asyncForEach(deletedCovers, async cover => {
                    let resCover = await models.OldCover.findOne({
                        where: {
                            number: cover.number,
                            fk_issue: res.id
                        },
                        transaction
                    });

                    await resCover.destroy({transaction: transaction});
                });

                let newCovers = item.covers.filter(n => {
                    let found = false;
                    oldCovers.forEach(o => {
                        if (!found)
                            found = coverEquals(n, o);
                    });

                    if (n.number === 0 && coverUrl !== '')
                        found = false;

                    return !found;
                });

                let url;
                newCovers.forEach(cover => {
                    if (cover.number === 0)
                        url = '';
                });

                if (url === '') {
                    deletedCovers.forEach(cover => {
                        if (cover.number === 0)
                            url = cover.url;
                    });
                }

                await asyncForEach(newCovers, async cover => {
                    if (url && url !== '' && cover.number === 0)
                        coverUrl = url;

                    await createCover(cover, res, coverUrl, transaction, us);
                });

                await transaction.commit();
                await update(oldS, oldC);
                await update(await res.getStories(), await res.getCovers());
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        verifyIssue: async (_, {item}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let where = {
                    number: item.number.trim(),
                    '$OldSeries.title$': item.series.title.trim(),
                    '$OldSeries.volume$': item.series.volume,
                    '$OldSeries->OldPublisher.name$': item.series.publisher.name.trim()
                };

                if (item.format)
                    where.format = item.format.trim();

                if (item.variant)
                    where.variant = item.variant.trim();

                let res = await models.OldIssue.findOne({
                    where: where,
                    include: [
                        {
                            model: models.OldSeries,
                            include: [
                                models.OldPublisher
                            ]
                        }
                    ],
                    transaction
                });

                res.verified = !res.verified;
                res = await res.save({transaction: transaction});

                await transaction.commit();
                return res;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },
     */,
};
