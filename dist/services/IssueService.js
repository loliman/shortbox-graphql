"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueService = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = __importDefault(require("../util/logger"));
const ALLOWED_LAST_EDITED_SORT_FIELDS = new Set([
    'updatedAt',
    'createdAt',
    'number',
    'format',
    'variant',
    'title',
    'id',
]);
const normalizeSortField = (field) => field && ALLOWED_LAST_EDITED_SORT_FIELDS.has(field) ? field : 'updatedAt';
const normalizeSortDirection = (direction) => {
    if (!direction)
        return 'DESC';
    const normalized = direction.toUpperCase();
    return normalized === 'ASC' || normalized === 'DESC' ? normalized : 'DESC';
};
class IssueService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        if (level === 'error') {
            logger_1.default.error(message, { requestId: this.requestId });
            return;
        }
        if (level === 'warn') {
            logger_1.default.warn(message, { requestId: this.requestId });
            return;
        }
        logger_1.default.info(message, { requestId: this.requestId });
    }
    async findIssues(pattern, series, first, after, loggedIn, filter) {
        const limit = first || 50;
        let decodedCursor;
        if (after) {
            decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
        }
        if (!filter) {
            const where = {};
            let options = {
                order: [
                    ['number', 'ASC'],
                    ['variant', 'ASC'],
                    ['id', 'ASC'],
                ],
                include: [
                    {
                        model: this.models.Series,
                        where: { title: series.title, volume: series.volume },
                        include: [
                            {
                                model: this.models.Publisher,
                                where: { name: series.publisher?.name },
                            },
                        ],
                    },
                ],
                where,
                limit: limit + 1,
            };
            if (decodedCursor) {
                where[sequelize_1.Op.and] = [
                    sequelize_1.Sequelize.literal(`(number, variant, Issue.id) > (SELECT number, variant, id FROM Issue WHERE id = ${decodedCursor})`),
                ];
            }
            if (pattern && pattern !== '') {
                options.where = {
                    ...options.where,
                    [sequelize_1.Op.or]: [
                        { number: { [sequelize_1.Op.like]: pattern + '%' } },
                        { title: { [sequelize_1.Op.like]: '%' + pattern + '%' } },
                    ],
                };
            }
            const results = await this.models.Issue.findAll(options);
            const hasNextPage = results.length > limit;
            const nodes = results.slice(0, limit);
            const edges = nodes.map((node) => ({
                cursor: Buffer.from(node.id.toString()).toString('base64'),
                node,
            }));
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: !!after,
                    startCursor: edges.length > 0 ? edges[0].cursor : null,
                    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
                },
            };
        }
        else {
            const { FilterService } = require('./FilterService');
            const filterService = new FilterService(this.models);
            const options = filterService.getFilterOptions(loggedIn, filter);
            const whereWithSymbols = options.where;
            options.limit = limit + 1;
            if (decodedCursor) {
                const currentAnd = Array.isArray(whereWithSymbols[sequelize_1.Op.and])
                    ? whereWithSymbols[sequelize_1.Op.and]
                    : [];
                whereWithSymbols[sequelize_1.Op.and] = [
                    ...currentAnd,
                    sequelize_1.Sequelize.literal(`(Issue.number, Issue.variant, Issue.id) > (SELECT number, variant, id FROM Issue WHERE id = ${decodedCursor})`),
                ];
            }
            const results = await this.models.Issue.findAll(options);
            const hasNextPage = results.length > limit;
            const nodes = results.slice(0, limit);
            const edges = nodes.map((node) => ({
                cursor: Buffer.from(node.id.toString()).toString('base64'),
                node,
            }));
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: !!after,
                    startCursor: edges.length > 0 ? edges[0].cursor : null,
                    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
                },
            };
        }
    }
    async deleteIssue(item, transaction) {
        this.log(`Deleting issue: ${item.series?.title} #${item.number}`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (item.series?.publisher?.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        let series = await this.models.Series.findOne({
            where: {
                title: (item.series?.title || '').trim(),
                volume: item.series?.volume,
                fk_publisher: pub.id,
            },
            transaction,
        });
        if (!series)
            throw new Error('Series not found');
        let issue = await this.models.Issue.findOne({
            where: {
                number: item.number ? item.number.trim() : '',
                variant: item.variant ? item.variant.trim() : '',
                fk_series: series.id,
            },
            transaction,
        });
        if (!issue)
            throw new Error('Issue not found');
        return await issue.deleteInstance(transaction, this.models);
    }
    async createIssue(item, transaction) {
        this.log(`Creating issue: ${item.series?.title} #${item.number}`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (item.series?.publisher?.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        let series = await this.models.Series.findOne({
            where: {
                title: (item.series?.title || '').trim(),
                volume: item.series?.volume,
                fk_publisher: pub.id,
            },
            transaction,
        });
        if (!series)
            throw new Error('Series not found');
        return await this.models.Issue.create({
            title: (item.title || '').trim(),
            number: (item.number || '').trim(),
            format: item.format,
            variant: (item.variant || '').trim(),
            releasedate: item.releasedate,
            pages: item.pages,
            price: item.price,
            currency: item.currency,
            fk_series: series.id,
            isbn: item.isbn,
            limitation: item.limitation,
            addinfo: item.addinfo,
        }, { transaction });
    }
    async editIssue(old, item, transaction) {
        this.log(`Editing issue: ${old.series?.title} #${old.number}`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (old.series?.publisher?.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        let series = await this.models.Series.findOne({
            where: {
                title: (old.series?.title || '').trim(),
                volume: old.series?.volume,
                fk_publisher: pub.id,
            },
            transaction,
        });
        if (!series)
            throw new Error('Series not found');
        let res = await this.models.Issue.findOne({
            where: {
                number: (old.number || '').trim(),
                variant: (old.variant || '').trim(),
                fk_series: series.id,
            },
            transaction,
        });
        if (!res)
            throw new Error('Issue not found');
        res.title = (item.title || '').trim();
        res.number = (item.number || '').trim();
        res.format = item.format || '';
        res.variant = (item.variant || '').trim();
        res.releasedate = item.releasedate ?? '';
        res.pages = item.pages || 0;
        res.price = item.price || 0;
        res.currency = item.currency || '';
        res.isbn = item.isbn || '';
        res.limitation = item.limitation || '';
        res.addinfo = item.addinfo || '';
        return await res.save({ transaction });
    }
    async getLastEdited(filter, first, after, order, direction, loggedIn) {
        const limit = first || 25;
        let decodedCursor;
        if (after) {
            const parsed = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
            decodedCursor = Number.isFinite(parsed) ? parsed : undefined;
        }
        const sortField = normalizeSortField(order);
        const sortDirection = normalizeSortDirection(direction);
        const where = {};
        let options = {
            order: [
                [sortField, sortDirection],
                ['id', sortDirection],
            ],
            limit: limit + 1,
            where,
            include: [
                {
                    model: this.models.Series,
                    include: [{ model: this.models.Publisher }],
                },
            ],
        };
        if (decodedCursor) {
            const op = sortDirection.toUpperCase() === 'DESC' ? sequelize_1.Op.lt : sequelize_1.Op.gt;
            const cursorRecord = await this.models.Issue.findByPk(decodedCursor, {
                attributes: ['id', sortField],
            });
            if (cursorRecord) {
                const cursorValue = cursorRecord.get(sortField);
                const currentAnd = Array.isArray(where[sequelize_1.Op.and]) ? where[sequelize_1.Op.and] : [];
                if (cursorValue === null || cursorValue === undefined) {
                    where[sequelize_1.Op.and] = [...currentAnd, { id: { [op]: decodedCursor } }];
                }
                else {
                    where[sequelize_1.Op.and] = [
                        ...currentAnd,
                        {
                            [sequelize_1.Op.or]: [
                                { [sortField]: { [op]: cursorValue } },
                                { [sortField]: cursorValue, id: { [op]: decodedCursor } },
                            ],
                        },
                    ];
                }
            }
        }
        if (filter) {
            const includeList = options.include;
            const seriesInclude = includeList[0];
            const publisherInclude = seriesInclude.include?.[0];
            if (publisherInclude && filter.us !== undefined && filter.us !== null) {
                publisherInclude.where = { ...publisherInclude.where, original: filter.us ? 1 : 0 };
            }
            if (publisherInclude &&
                filter.publishers &&
                filter.publishers.length > 0 &&
                filter.publishers[0]) {
                publisherInclude.where = {
                    ...publisherInclude.where,
                    name: filter.publishers[0].name,
                };
            }
            if (filter.series && filter.series.length > 0 && filter.series[0]) {
                seriesInclude.where = {
                    ...seriesInclude.where,
                    title: filter.series[0].title,
                    volume: filter.series[0].volume,
                };
            }
        }
        const results = await this.models.Issue.findAll(options);
        const hasNextPage = results.length > limit;
        const nodes = results.slice(0, limit);
        const edges = nodes.map((node) => ({
            cursor: Buffer.from(node.id.toString()).toString('base64'),
            node,
        }));
        return {
            edges,
            pageInfo: {
                hasNextPage,
                hasPreviousPage: !!after,
                startCursor: edges.length > 0 ? edges[0].cursor : null,
                endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
            },
        };
    }
    async getIssuesByIds(ids) {
        const issues = await this.models.Issue.findAll({
            where: { id: { [sequelize_1.Op.in]: [...ids] } },
        });
        return ids.map((id) => issues.find((i) => i.id === id) || null);
    }
    async getStoriesByIssueIds(issueIds) {
        const stories = await this.models.Story.findAll({
            where: { fk_issue: { [sequelize_1.Op.in]: [...issueIds] } },
            order: [
                ['number', 'ASC'],
                ['id', 'ASC'],
            ],
        });
        return issueIds.map((issueId) => stories.filter((story) => story.fk_issue === issueId));
    }
    async getPrimaryCoversByIssueIds(issueIds) {
        const covers = await this.models.Cover.findAll({
            where: {
                fk_issue: { [sequelize_1.Op.in]: [...issueIds] },
                number: 0,
            },
            order: [['id', 'ASC']],
        });
        return issueIds.map((issueId) => covers.find((cover) => cover.fk_issue === issueId) || null);
    }
    async getCoversByIssueIds(issueIds) {
        const covers = await this.models.Cover.findAll({
            where: { fk_issue: { [sequelize_1.Op.in]: [...issueIds] } },
            order: [
                ['number', 'ASC'],
                ['id', 'ASC'],
            ],
        });
        return issueIds.map((issueId) => covers.filter((cover) => cover.fk_issue === issueId));
    }
    async getFeaturesByIssueIds(issueIds) {
        const features = await this.models.Feature.findAll({
            where: { fk_issue: { [sequelize_1.Op.in]: [...issueIds] } },
            order: [
                ['number', 'ASC'],
                ['id', 'ASC'],
            ],
        });
        return issueIds.map((issueId) => features.filter((feature) => feature.fk_issue === issueId));
    }
    async getVariantsBySeriesAndNumberKeys(keys) {
        if (keys.length === 0)
            return [];
        const parsedKeys = keys.map((key) => {
            const [seriesPart, ...numberParts] = key.split('::');
            const fkSeries = parseInt(seriesPart || '', 10);
            return {
                key,
                fkSeries: Number.isFinite(fkSeries) ? fkSeries : 0,
                number: numberParts.join('::'),
            };
        });
        const whereOr = parsedKeys.map(({ fkSeries, number }) => ({
            fk_series: fkSeries,
            number,
        }));
        const variants = await this.models.Issue.findAll({
            where: { [sequelize_1.Op.or]: whereOr },
            order: [
                ['variant', 'ASC'],
                ['id', 'ASC'],
            ],
        });
        return parsedKeys.map(({ fkSeries, number }) => variants.filter((variant) => variant.fk_series === fkSeries && variant.number === number));
    }
}
exports.IssueService = IssueService;
