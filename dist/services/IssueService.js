"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssueService = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = __importDefault(require("../util/logger"));
class IssueService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        logger_1.default[level](message, { requestId: this.requestId });
    }
    async findIssues(pattern, series, first, after, loggedIn, filter) {
        const limit = first || 50;
        let decodedCursor;
        if (after) {
            decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
        }
        if (!filter) {
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
                where: {},
                limit: limit + 1,
            };
            if (decodedCursor) {
                options.where[sequelize_1.Op.and] = [
                    sequelize_1.Sequelize.literal(`(number, variant, Issue.id) > (SELECT number, variant, id FROM Issue WHERE id = ${decodedCursor})`)
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
            const edges = nodes.map(node => ({
                cursor: Buffer.from(node.id.toString()).toString('base64'),
                node: node
            }));
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: !!after,
                    startCursor: edges.length > 0 ? edges[0].cursor : null,
                    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
                }
            };
        }
        else {
            const { FilterService } = require('./FilterService');
            const filterService = new FilterService(this.models);
            const options = filterService.getFilterOptions(loggedIn, filter);
            options.limit = limit + 1;
            if (decodedCursor) {
                options.where[sequelize_1.Op.and] = [
                    ...(options.where[sequelize_1.Op.and] || []),
                    sequelize_1.Sequelize.literal(`(Issue.number, Issue.variant, Issue.id) > (SELECT number, variant, id FROM Issue WHERE id = ${decodedCursor})`)
                ];
            }
            const results = await this.models.Issue.findAll(options);
            const hasNextPage = results.length > limit;
            const nodes = results.slice(0, limit);
            const edges = nodes.map(node => ({
                cursor: Buffer.from(node.id.toString()).toString('base64'),
                node: node
            }));
            return {
                edges,
                pageInfo: {
                    hasNextPage,
                    hasPreviousPage: !!after,
                    startCursor: edges.length > 0 ? edges[0].cursor : null,
                    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
                }
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
        res.releasedate = item.releasedate;
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
            decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
        }
        const sortField = order || 'updatedAt';
        const sortDirection = direction || 'DESC';
        let options = {
            order: [
                [sortField, sortDirection],
                ['id', sortDirection],
            ],
            limit: limit + 1,
            where: {},
            include: [
                {
                    model: this.models.Series,
                    include: [{ model: this.models.Publisher }],
                },
            ],
        };
        if (decodedCursor) {
            const op = sortDirection.toUpperCase() === 'DESC' ? sequelize_1.Op.lt : sequelize_1.Op.gt;
            options.where[sequelize_1.Op.and] = [
                sequelize_1.Sequelize.literal(`(${sortField}, id) ${op === sequelize_1.Op.lt ? '<' : '>'} (SELECT ${sortField}, id FROM Issue WHERE id = ${decodedCursor})`),
            ];
        }
        if (filter) {
            const seriesInclude = options.include[0];
            const publisherInclude = seriesInclude.include[0];
            if (filter.us !== undefined && filter.us !== null) {
                publisherInclude.where = { ...publisherInclude.where, original: filter.us ? 1 : 0 };
            }
            if (filter.publishers && filter.publishers.length > 0 && filter.publishers[0]) {
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
            node: node,
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
}
exports.IssueService = IssueService;
