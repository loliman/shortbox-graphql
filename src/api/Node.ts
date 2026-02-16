import gql from 'graphql-tag';
import models from '../models';
import { naturalCompare, generateLabel, romanize } from '../util/util';
import { NodeResolvers } from '../types/graphql';
import { Op } from 'sequelize';

export const typeDef = gql`
  extend type Query {
    nodes(pattern: String!, us: Boolean!, offset: Int): [Node]
  }

  type Node {
    type: String
    label: String
    url: String
  }
`;

type SeriesWithPublisher = {
  title: string;
  volume: number;
  startyear: number;
  endyear: number | null;
  Publisher: { name: string };
};

type IssueWithSeries = {
  title: string;
  number: string;
  format: string;
  variant: string;
  Series: SeriesWithPublisher;
};

const createUrl = (
  type: string,
  original: boolean,
  publisherName: string,
  seriesTitle: string,
  seriesVolume: number,
  number: string,
  format: string,
  variant: string,
) => {
  let url = original ? '/us/' : '/de/';
  url += encodeURIComponent(publisherName);
  if (type !== 'publisher') {
    url += `/${encodeURIComponent(seriesTitle)}_Vol_${seriesVolume}`;
    if (type !== 'series') {
      url += `/${encodeURIComponent(number)}/${encodeURIComponent(format)}`;
      if (variant) {
        url += `_${encodeURIComponent(variant)}`;
      }
    }
  }
  return url;
};

const createSeriesLabel = (
  seriesTitle: string,
  publisherName: string,
  volume: number,
  startyear: number,
  endyear: number | null,
) => {
  let years = ` (${startyear}`;
  if (endyear && endyear > startyear) {
    years += `-${endyear}`;
  }
  years += ')';
  return `${seriesTitle} (Vol. ${romanize(volume)})${years} (${publisherName})`;
};

const createIssueLabel = (
  seriesLabel: string,
  number: string,
  format: string,
  variant: string,
  issueTitle: string,
) => {
  let label = `${seriesLabel} #${number}`;
  let fmt = ` (${format}`;
  if (variant) {
    fmt += `/${variant}`;
  }
  fmt += ')';
  label += fmt;
  if (issueTitle) {
    label += `: ${issueTitle}`;
  }
  return label;
};

export const resolvers: NodeResolvers = {
  Query: {
    nodes: async (_, { pattern, us, offset }) => {
      if (!pattern || pattern.trim() === '') return [];

      const searchPattern = `%${pattern.replace(/\s/g, '%')}%`;

      // 1. Publishers
      const publishers = await models.Publisher.findAll({
        where: {
          original: us,
          name: { [Op.iLike]: searchPattern },
        },
        limit: 20,
      });

      // 2. Series
      const series = await models.Series.findAll({
        include: [
          {
            model: models.Publisher,
            required: true,
            where: { original: us },
          },
        ],
        where: {
          title: { [Op.iLike]: searchPattern },
        },
        limit: 20,
      });

      // 3. Issues
      const issues = await models.Issue.findAll({
        include: [
          {
            model: models.Series,
            required: true,
            include: [
              {
                model: models.Publisher,
                required: true,
                where: { original: us },
              },
            ],
          },
        ],
        where: {
          [Op.or]: [
            { title: { [Op.iLike]: searchPattern } },
            { number: { [Op.iLike]: `${pattern}%` } },
          ],
        },
        limit: 20,
      });

      const nodes = [
        ...publishers.map((p) => ({
          type: 'publisher',
          label: p.name,
          url: createUrl('publisher', us, p.name, '', 0, '', '', ''),
        })),
        ...series.map((s) => {
          const seriesNode = s as unknown as SeriesWithPublisher;
          const label = createSeriesLabel(
            seriesNode.title,
            seriesNode.Publisher.name,
            seriesNode.volume,
            seriesNode.startyear,
            seriesNode.endyear,
          );
          return {
            type: 'series',
            label,
            url: createUrl(
              'series',
              us,
              seriesNode.Publisher.name,
              seriesNode.title,
              seriesNode.volume,
              '',
              '',
              '',
            ),
          };
        }),
        ...issues.map((i) => {
          const issueNode = i as unknown as IssueWithSeries;
          const issueSeries = issueNode.Series;
          const seriesLabel = createSeriesLabel(
            issueSeries.title,
            issueSeries.Publisher.name,
            issueSeries.volume,
            issueSeries.startyear,
            issueSeries.endyear,
          );
          const label = createIssueLabel(
            seriesLabel,
            issueNode.number,
            issueNode.format,
            issueNode.variant,
            issueNode.title,
          );
          return {
            type: 'issue',
            label,
            url: createUrl(
              'issue',
              us,
              issueSeries.Publisher.name,
              issueSeries.title,
              issueSeries.volume,
              issueNode.number,
              issueNode.format,
              issueNode.variant,
            ),
          };
        }),
      ];

      // Re-apply the specific ordering and pattern matching logic from the original SQL
      nodes.sort((a, b) => {
        const getRank = (label: string) => {
          if (label.toLowerCase() === pattern.toLowerCase()) return 1;
          if (label.toLowerCase().startsWith(pattern.toLowerCase())) return 2;
          if (label.toLowerCase().endsWith(pattern.toLowerCase())) return 4;
          return 3;
        };

        const rankA = getRank(a.label);
        const rankB = getRank(b.label);

        if (rankA !== rankB) return rankA - rankB;
        return a.label.localeCompare(b.label);
      });

      return nodes.slice(offset || 0, (offset || 0) + 20);
    },
  },
  Node: {
    type: (parent) => (parent as { type?: string }).type || null,
    label: (parent) => (parent as { label?: string }).label || null,
    url: (parent) => (parent as { url?: string }).url || null,
  },
};
