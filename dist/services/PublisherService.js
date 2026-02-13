"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublisherService = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = __importDefault(require("../util/logger"));
class PublisherService {
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
    async findPublishers(pattern, us, first, after, loggedIn, filter) {
        const limit = first || 50;
        let decodedCursor;
        if (after) {
            decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
        }
        if (!filter) {
            const where = { original: us };
            let options = {
                order: [
                    ['name', 'ASC'],
                    ['id', 'ASC'],
                ],
                where,
                limit: limit + 1,
            };
            if (decodedCursor) {
                where[sequelize_1.Op.and] = [
                    sequelize_1.Sequelize.literal(`(name, id) > (SELECT name, id FROM Publisher WHERE id = ${decodedCursor})`),
                ];
            }
            if (pattern && pattern !== '') {
                options.where = {
                    ...options.where,
                    name: { [sequelize_1.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' },
                };
                // Note: Complex ordering with cursor-based pagination is tricky.
                // For now we stick to name/id ordering when using pattern search to keep cursor stability.
            }
            const results = await this.models.Publisher.findAll(options);
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
        else {
            const { FilterService } = require('./FilterService');
            const filterService = new FilterService(this.models, this.requestId);
            const options = filterService.getFilterOptions(loggedIn, filter);
            const whereWithSymbols = options.where;
            options.group = ['Series.fk_publisher'];
            options.limit = limit + 1;
            if (decodedCursor) {
                const currentAnd = Array.isArray(whereWithSymbols[sequelize_1.Op.and])
                    ? whereWithSymbols[sequelize_1.Op.and]
                    : [];
                whereWithSymbols[sequelize_1.Op.and] = [
                    ...currentAnd,
                    sequelize_1.Sequelize.literal(`(Series->Publisher.name, Series->Publisher.id) > (SELECT name, id FROM Publisher WHERE id = ${decodedCursor})`),
                ];
            }
            const res = await this.models.Issue.findAll(options);
            const hasNextPage = res.length > limit;
            const nodes = res.slice(0, limit).map((issue) => {
                const issueNode = issue;
                return {
                    id: issueNode.Series.Publisher.id,
                    name: issueNode.Series.Publisher.name,
                    original: us,
                };
            });
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
    async deletePublisher(item, transaction) {
        this.log(`Deleting publisher: ${item.name}`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (item.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        let series = await this.models.Series.findAll({
            where: { fk_publisher: pub.id },
            transaction,
        });
        for (const s of series) {
            await s.deleteInstance(transaction, this.models);
        }
        return await pub.destroy({ transaction });
    }
    async createPublisher(item, transaction) {
        this.log(`Creating publisher: ${item.name}`);
        return await this.models.Publisher.create({
            name: (item.name || '').trim(),
            addinfo: item.addinfo,
            original: item.us,
            startyear: item.startyear,
            endyear: item.endyear,
        }, { transaction });
    }
    async editPublisher(old, item, transaction) {
        this.log(`Editing publisher: ${old.name} -> ${item.name}`);
        let res = await this.models.Publisher.findOne({
            where: { name: (old.name || '').trim() },
            transaction,
        });
        if (!res)
            throw new Error('Publisher not found');
        res.name = (item.name || '').trim();
        res.addinfo = item.addinfo || '';
        res.startyear = item.startyear || 0;
        res.endyear = item.endyear || 0;
        return await res.save({ transaction });
    }
    async getPublishersByIds(ids) {
        const publishers = await this.models.Publisher.findAll({
            where: { id: { [sequelize_1.Op.in]: [...ids] } },
        });
        // Map result back to the order of IDs
        return ids.map((id) => publishers.find((p) => p.id === id) || null);
    }
}
exports.PublisherService = PublisherService;
