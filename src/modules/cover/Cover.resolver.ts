import { CoverResolvers } from '../../types/graphql';

type CoverParent = {
  id: number;
  url?: string | null;
  fk_parent?: number | null;
  fk_issue: number;
  issue?: { comicguideid?: unknown; series?: { publisher?: { original?: boolean } } } | null;
  getIndividuals?: () => Promise<unknown[]>;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

const resolveComicguideId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  if (trimmed === '0') return null;

  return String(Number(trimmed));
};

const getComicguideCoverUrl = (comicguideId: string): string =>
  `https://www.comicguide.de/pics/large/${comicguideId}.jpg`;

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const resolvers: CoverResolvers = {
  Cover: {
    id: (parent, _, { loggedIn }) => {
      const coverParent = parent as CoverParent;
      if (!loggedIn) return String(new Date().getTime());
      if (typeof coverParent.id === 'number' && Number.isFinite(coverParent.id)) {
        return String(coverParent.id);
      }
      return String(new Date().getTime());
    },
    url: async (parent, _, { issueLoader }) => {
      const coverParent = parent as CoverParent;
      const directUrl = coverParent.url?.trim();
      if (directUrl) return directUrl;

      const preloadedIssue = coverParent.issue;
      const issue =
        preloadedIssue ||
        (hasLoad<number, { comicguideid?: unknown } | null>(issueLoader)
          ? await issueLoader.load(coverParent.fk_issue)
          : null);
      const comicguideId = resolveComicguideId(issue?.comicguideid);

      if (!comicguideId) return null;
      return getComicguideCoverUrl(comicguideId);
    },
    parent: async (parent, _, { models }) => {
      const fkParent = (parent as CoverParent).fk_parent;
      if (typeof fkParent === 'number') {
        return await models.Cover.findByPk(fkParent);
      }
      return null;
    },
    children: async (parent, _, { models }) =>
      await models.Cover.findAll({ where: { fk_parent: (parent as CoverParent).id } }),
    issue: async (parent, _, { issueLoader }) => {
      const coverParent = parent as CoverParent;
      const preloadedIssue = coverParent.issue;
      if (preloadedIssue) return preloadedIssue;
      if (!hasLoad<number, unknown | null>(issueLoader)) return null;
      return await issueLoader.load(coverParent.fk_issue);
    },
    individuals: async (parent) =>
      (parent as CoverParent).getIndividuals
        ? await (parent as CoverParent).getIndividuals?.()
        : [],
    onlyapp: async (parent, _, { models, issueLoader }) => {
      const coverParent = parent as CoverParent;
      if (coverParent.issue) {
        return coverParent.issue.series?.publisher?.original === true;
      }

      const loadedIssueRaw = hasLoad<
        number,
        { fk_series?: unknown; series?: { publisher?: { original?: boolean } } } | null
      >(issueLoader)
        ? await issueLoader.load(coverParent.fk_issue)
        : null;
      const loadedIssue = loadedIssueRaw as {
        fk_series?: unknown;
        series?: { publisher?: { original?: boolean } };
      } | null;
      if (loadedIssue?.series?.publisher?.original === true) return true;

      const fkSeriesFromLoader = loadedIssue?.fk_series;
      const issueModel = (models as { Issue?: { findByPk?: unknown } } | null)?.Issue;
      const seriesModel = (models as { Series?: { findByPk?: unknown } } | null)?.Series;
      const publisherModel = (models as { Publisher?: { findByPk?: unknown } } | null)?.Publisher;

      if (
        !issueModel ||
        typeof issueModel.findByPk !== 'function' ||
        !seriesModel ||
        typeof seriesModel.findByPk !== 'function' ||
        !publisherModel ||
        typeof publisherModel.findByPk !== 'function'
      ) {
        return false;
      }

      const fkSeries = isPositiveNumber(fkSeriesFromLoader)
        ? fkSeriesFromLoader
        : (await issueModel.findByPk(coverParent.fk_issue, { attributes: ['fk_series'] }))
            ?.fk_series;
      if (!isPositiveNumber(fkSeries)) return false;

      const fkPublisher = (await seriesModel.findByPk(fkSeries, { attributes: ['fk_publisher'] }))
        ?.fk_publisher;
      if (!isPositiveNumber(fkPublisher)) return false;

      return (
        (await publisherModel.findByPk(fkPublisher, { attributes: ['original'] }))?.original ===
        true
      );
    },
    exclusive: (parent) => false, // Platzhalter für komplexere Logik falls benötigt
  },
};
