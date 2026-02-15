import { CoverResolvers } from '../../types/graphql';

type CoverParent = {
  id: number;
  url?: string | null;
  fk_parent?: number | null;
  fk_issue: number;
  issue?: { comicguideid?: unknown } | null;
  Issue?: { comicguideid?: unknown } | null;
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

      const issue =
        coverParent.Issue ||
        coverParent.issue ||
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
      if (coverParent.Issue) return coverParent.Issue;
      if (coverParent.issue) return coverParent.issue;
      if (!hasLoad<number, unknown | null>(issueLoader)) return null;
      return await issueLoader.load(coverParent.fk_issue);
    },
    individuals: async (parent) =>
      (parent as CoverParent).getIndividuals
        ? await (parent as CoverParent).getIndividuals?.()
        : [],
    onlyapp: async (parent, _, { models, issueLoader }) => {
      // Logik analog zum Original: Prüfen ob es eine US-Ausgabe ist
      const coverParent = parent as CoverParent;
      const issue =
        coverParent.Issue ||
        coverParent.issue ||
        (hasLoad<number, unknown | null>(issueLoader)
          ? await issueLoader.load(coverParent.fk_issue)
          : null);
      return (
        (issue as { Series?: { Publisher?: { original?: boolean } } } | null)?.Series?.Publisher
          ?.original === true
      );
    },
    exclusive: (parent) => false, // Platzhalter für komplexere Logik falls benötigt
  },
};
