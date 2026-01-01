"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const models_1 = __importDefault(require("../models"));
const util_1 = require("../util/util");
const sequelize_1 = require("sequelize");
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Query {
    nodes(pattern: String!, us: Boolean!, offset: Int): [Node]
  }

  type Node {
    type: String
    label: String
    url: String
  }
`;
const createUrl = (type, original, publisherName, seriesTitle, seriesVolume, number, format, variant) => {
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
const createSeriesLabel = (seriesTitle, publisherName, volume, startyear, endyear) => {
    let years = ` (${startyear}`;
    if (endyear && endyear > startyear) {
        years += `-${endyear}`;
    }
    years += ')';
    return `${seriesTitle} (Vol. ${(0, util_1.romanize)(volume)})${years} (${publisherName})`;
};
const createIssueLabel = (seriesLabel, number, format, variant, issueTitle) => {
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
exports.resolvers = {
    Query: {
        nodes: async (_, { pattern, us, offset }) => {
            if (!pattern || pattern.trim() === '')
                return [];
            const searchPattern = `%${pattern.replace(/\s/g, '%')}%`;
            // 1. Publishers
            const publishers = await models_1.default.Publisher.findAll({
                where: {
                    original: us,
                    name: { [sequelize_1.Op.like]: searchPattern }
                },
                limit: 20
            });
            // 2. Series
            const series = await models_1.default.Series.findAll({
                include: [{
                        model: models_1.default.Publisher,
                        required: true,
                        where: { original: us }
                    }],
                where: {
                    title: { [sequelize_1.Op.like]: searchPattern }
                },
                limit: 20
            });
            // 3. Issues
            const issues = await models_1.default.Issue.findAll({
                include: [{
                        model: models_1.default.Series,
                        required: true,
                        include: [{
                                model: models_1.default.Publisher,
                                required: true,
                                where: { original: us }
                            }]
                    }],
                where: {
                    [sequelize_1.Op.or]: [
                        { title: { [sequelize_1.Op.like]: searchPattern } },
                        { number: { [sequelize_1.Op.like]: `${pattern}%` } }
                    ]
                },
                limit: 20
            });
            const nodes = [
                ...publishers.map(p => ({
                    type: 'publisher',
                    label: p.name,
                    url: createUrl('publisher', us, p.name, '', 0, '', '', '')
                })),
                ...series.map(s => {
                    const label = createSeriesLabel(s.title, s.Publisher.name, s.volume, s.startyear, s.endyear);
                    return {
                        type: 'series',
                        label,
                        url: createUrl('series', us, s.Publisher.name, s.title, s.volume, '', '', '')
                    };
                }),
                ...issues.map(i => {
                    const s = i.Series;
                    const seriesLabel = createSeriesLabel(s.title, s.Publisher.name, s.volume, s.startyear, s.endyear);
                    const label = createIssueLabel(seriesLabel, i.number, i.format, i.variant, i.title);
                    return {
                        type: 'issue',
                        label,
                        url: createUrl('issue', us, s.Publisher.name, s.title, s.volume, i.number, i.format, i.variant)
                    };
                })
            ];
            // Re-apply the specific ordering and pattern matching logic from the original SQL
            nodes.sort((a, b) => {
                const getRank = (label) => {
                    if (label.toLowerCase() === pattern.toLowerCase())
                        return 1;
                    if (label.toLowerCase().startsWith(pattern.toLowerCase()))
                        return 2;
                    if (label.toLowerCase().endsWith(pattern.toLowerCase()))
                        return 4;
                    return 3;
                };
                const rankA = getRank(a.label);
                const rankB = getRank(b.label);
                if (rankA !== rankB)
                    return rankA - rankB;
                return a.label.localeCompare(b.label);
            });
            return nodes.slice(offset || 0, (offset || 0) + 20);
        },
    },
    Node: {
        type: (parent) => parent.type || null,
        label: (parent) => parent.label || null,
        url: (parent) => parent.url || null,
    },
};
