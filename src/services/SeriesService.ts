import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, PublisherInput, SeriesInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes } from '../core/cursor';

type SeriesInputWithGenre = SeriesInput & { genre?: string | null };

const LEADING_ARTICLE_REGEX = /^(der|die|das|the)\s+/i;
const SPECIAL_SORT_CHARACTERS_REGEX = /[^\p{L}\p{N}\s]/gu;

const normalizeGermanSortLetters = (value: string): string =>
  value
    .replace(/ä/gi, 'a')
    .replace(/ö/gi, 'o')
    .replace(/ü/gi, 'u')
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'ss');

const normalizeSeriesTitleForSort = (value: string | null | undefined): string =>
  normalizeGermanSortLetters(
    String(value || '')
      .trim()
      .replace(LEADING_ARTICLE_REGEX, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(SPECIAL_SORT_CHARACTERS_REGEX, ' ')
      .replace(/\s+/g, ' '),
  )
    .trim()
    .toLocaleLowerCase('de-DE');

const normalizeSeriesTitleForTieBreak = (value: string | null | undefined): string =>
  normalizeSeriesTitleForSort(value);

const compareSeriesTitles = (
  left: { title?: string | null; volume?: number | null; id?: number | null },
  right: { title?: string | null; volume?: number | null; id?: number | null },
): number =>
  normalizeSeriesTitleForSort(left.title).localeCompare(normalizeSeriesTitleForSort(right.title), 'de-DE', {
    sensitivity: 'base',
  }) ||
  normalizeSeriesTitleForTieBreak(left.title).localeCompare(normalizeSeriesTitleForTieBreak(right.title), 'de-DE', {
    sensitivity: 'base',
  }) ||
  Number(left.volume || 0) - Number(right.volume || 0) ||
  Number(left.id || 0) - Number(right.id || 0);

const normalizeSeriesGenre = (item: SeriesInput | undefined): string => {
  const genre = (item as SeriesInputWithGenre | undefined)?.genre;
  return typeof genre === 'string' ? genre.trim() : '';
};

const splitGenres = (value: unknown): string[] =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const matchesGenrePattern = (genre: string, pattern: string): boolean => {
  if (!pattern) return true;

  const normalizedGenre = genre.toLowerCase();
  const parts = pattern
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return true;

  let index = 0;
  for (const part of parts) {
    const next = normalizedGenre.indexOf(part, index);
    if (next < 0) return false;
    index = next + part.length;
  }

  return true;
};

export class SeriesService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    if (level === 'error') {
      logger.error(message, { requestId: this.requestId });
      return;
    }
    if (level === 'warn') {
      logger.warn(message, { requestId: this.requestId });
      return;
    }
    logger.info(message, { requestId: this.requestId });
  }

  async findSeries(
    pattern: string | undefined,
    publisher: PublisherInput,
    first: number | undefined,
    after: string | undefined,
    loggedIn: boolean,
    filter: Filter | undefined,
  ) {
    type WhereMap = Record<string | symbol, unknown>;
    type IssueWithSeries = {
      series: {
        id: number;
        title: string;
        volume: number;
        startyear: number;
        endyear: number;
        genre: string;
        fk_publisher: number;
      };
    };
    void first;
    void after;

    if (!filter) {
      const where: WhereMap = {};
      const publisherName = typeof publisher?.name === 'string' ? publisher.name.trim() : '';
      const shouldFilterPublisherName = publisherName !== '' && publisherName !== '*';
      const shouldFilterPublisherUs = typeof publisher?.us === 'boolean';
      let options: FindOptions = {
        order: [
          ['title', 'ASC'],
          ['volume', 'ASC'],
          ['id', 'ASC'],
        ],
        include: [{ model: this.models.Publisher, as: 'publisher' }],
        where,
      };

      if (shouldFilterPublisherName)
        options.where = { ...options.where, '$publisher.name$': publisherName };

      if (shouldFilterPublisherUs)
        options.where = { ...options.where, '$publisher.original$': Boolean(publisher.us) };

      if (pattern && pattern !== '') {
        options.where = {
          ...options.where,
          title: { [Op.iLike]: '%' + pattern.replace(/\s/g, '%') + '%' },
        };
        // Ordering remains title/volume/id for cursor stability
      }

      const loadSeries = async (currentOptions: FindOptions) =>
        await this.models.Series.findAll(currentOptions);
      let results = await loadSeries(options);
      results = [...results].sort((left, right) => compareSeriesTitles(left, right));

      return buildConnectionFromNodes(results, results.length, undefined);
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models, this.requestId);
      const options = filterService.getFilterOptions(loggedIn, filter);
      options.attributes = ['id', 'fk_series'];
      const where = options.where as Record<string | symbol, unknown>;
      const publisherName = typeof publisher?.name === 'string' ? publisher.name.trim() : '';
      const shouldFilterPublisherName = publisherName !== '' && publisherName !== '*';
      const shouldFilterPublisherUs = typeof publisher?.us === 'boolean';

      if (shouldFilterPublisherName) {
        where['$series.publisher.name$'] = publisherName;
      }
      if (shouldFilterPublisherUs) {
        where['$series.publisher.original$'] = Boolean(publisher.us);
      }

      const includeList = options.include as Array<{ attributes?: string[]; include?: unknown[] }>;
      const seriesInclude = includeList[0];
      if (seriesInclude) {
        seriesInclude.attributes = [
          'id',
          'title',
          'volume',
          'startyear',
          'endyear',
          'genre',
          'fk_publisher',
        ];
      }

      const res = await this.models.Issue.findAll(options);
      const uniqueNodes = new Map<number, IssueWithSeries>();
      res.forEach((issue) => {
        const issueNode = issue as unknown as IssueWithSeries;
        uniqueNodes.set(issueNode.series.id, issueNode);
      });

      const nodes = [...uniqueNodes.values()]
        .map((issueNode) => ({
          id: issueNode.series.id,
          title: issueNode.series.title,
          volume: issueNode.series.volume,
          startyear: issueNode.series.startyear,
          endyear: issueNode.series.endyear,
          genre: issueNode.series.genre,
          fk_publisher: issueNode.series.fk_publisher,
        }))
        .sort((left, right) => compareSeriesTitles(left, right));
      return buildConnectionFromNodes(nodes, nodes.length, undefined);
    }
  }

  async findGenres(pattern: string | undefined, first: number | undefined, after: string | undefined) {
    type GenreRow = { genre?: string | null };

    const limit = typeof first === 'number' && first > 0 ? first : 50;
    const normalizedPattern = typeof pattern === 'string' ? pattern.trim() : '';
    const normalizedAfter = typeof after === 'string' ? after.trim().toLowerCase() : '';

    const where: Record<string | symbol, unknown> = {};
    if (normalizedPattern !== '') {
      where.genre = { [Op.iLike]: '%' + normalizedPattern.replace(/\s/g, '%') + '%' };
    }

    const rows = (await this.models.Series.findAll({
      attributes: ['genre'],
      where,
      order: [
        ['genre', 'ASC'],
        ['id', 'ASC'],
      ],
      raw: true,
    })) as GenreRow[];

    const unique = new Map<string, string>();
    rows.forEach((row) => {
      splitGenres(row.genre).forEach((genre) => {
        if (!matchesGenrePattern(genre, normalizedPattern)) return;

        const key = genre.toLowerCase();
        if (!unique.has(key)) unique.set(key, genre);
      });
    });

    const sortedGenres = [...unique.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    );

    if (!normalizedAfter) {
      return sortedGenres.slice(0, limit);
    }

    return sortedGenres.filter((genre) => genre.toLowerCase() > normalizedAfter).slice(0, limit);
  }

  async deleteSeries(item: SeriesInput, transaction: Transaction) {
    this.log(`Deleting series: ${item.title} (Vol. ${item.volume})`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let series = await this.models.Series.findOne({
      where: { title: (item.title || '').trim(), volume: item.volume, fk_publisher: pub.id },
      transaction,
    });

    if (!series) {
      throw new Error('Series not found');
    }

    return await series.deleteInstance(transaction, this.models);
  }

  async createSeries(item: SeriesInput, transaction: Transaction) {
    this.log(`Creating series: ${item.title} (Vol. ${item.volume})`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    return await this.models.Series.create(
      {
        title: (item.title || '').trim(),
        volume: item.volume,
        startyear: item.startyear,
        endyear: item.endyear,
        genre: normalizeSeriesGenre(item),
        addinfo: item.addinfo,
        fk_publisher: pub.id,
      },
      { transaction },
    );
  }

  async editSeries(old: SeriesInput, item: SeriesInput, transaction: Transaction) {
    this.log(`Editing series: ${old.title} -> ${item.title}`);
    const oldPublisher = await this.models.Publisher.findOne({
      where: { name: (old.publisher?.name || '').trim() },
      transaction,
    });

    if (!oldPublisher) throw new Error('Publisher not found');

    let res = await this.models.Series.findOne({
      where: {
        title: (old.title || '').trim(),
        volume: old.volume,
        fk_publisher: oldPublisher.id,
      },
      transaction,
    });

    if (!res) {
      throw new Error('Series not found');
    }

    const newPublisher = await this.models.Publisher.findOne({
      where: { name: (item.publisher?.name || '').trim() },
      transaction,
    });

    if (!newPublisher) throw new Error('Publisher not found');

    res.title = (item.title || '').trim();
    res.volume = item.volume || 0;
    res.startyear = item.startyear || 0;
    res.endyear = item.endyear || 0;
    res.genre = normalizeSeriesGenre(item);
    res.addinfo = item.addinfo || '';
    res.fk_publisher = newPublisher.id;
    return await res.save({ transaction });
  }

  async getSeriesByIds(ids: readonly number[]) {
    const series = await this.models.Series.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    return ids.map((id) => series.find((s) => s.id === id) || null);
  }
}
