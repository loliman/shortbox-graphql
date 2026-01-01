"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeriesService = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = __importDefault(require("../util/logger"));
class SeriesService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        logger_1.default[level](message, { requestId: this.requestId });
    }
    async findSeries(pattern, publisher, first, after, loggedIn, filter) {
        const limit = first || 50;
        let decodedCursor;
        if (after) {
            decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
        }
        if (!filter) {
            let options = {
                order: [
                    [sequelize_1.Sequelize.fn('sortabletitle', sequelize_1.Sequelize.col('title')), 'ASC'],
                    ['volume', 'ASC'],
                    ['id', 'ASC'],
                ],
                include: [{ model: this.models.Publisher }],
                where: {},
                limit: limit + 1,
            };
            if (decodedCursor) {
                options.where[sequelize_1.Op.and] = [
                    sequelize_1.Sequelize.literal(`(sortabletitle(title), volume, Series.id) > (SELECT sortabletitle(title), volume, id FROM Series WHERE id = ${decodedCursor})`)
                ];
            }
            if (publisher.name !== '*')
                options.where = { ...options.where, '$Publisher.name$': publisher.name };
            if (publisher.us !== undefined && publisher.us !== null)
                options.where = { ...options.where, '$Publisher.original$': publisher.us ? 1 : 0 };
            if (pattern && pattern !== '') {
                options.where = {
                    ...options.where,
                    title: { [sequelize_1.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' },
                };
                // Ordering remains title/volume/id for cursor stability
            }
            const results = await this.models.Series.findAll(options);
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
            options.group = ['fk_series'];
            options.limit = limit + 1;
            if (decodedCursor) {
                options.where[sequelize_1.Op.and] = [
                    ...(options.where[sequelize_1.Op.and] || []),
                    sequelize_1.Sequelize.literal(`(sortabletitle(Series.title), Series.volume, Series.id) > (SELECT sortabletitle(title), volume, id FROM Series WHERE id = ${decodedCursor})`)
                ];
            }
            const res = await this.models.Issue.findAll(options);
            const hasNextPage = res.length > limit;
            const nodes = res.slice(0, limit).map((i) => ({
                id: i.Series.id,
                title: i.Series.title,
                volume: i.Series.volume,
                startyear: i.Series.startyear,
                endyear: i.Series.endyear,
                fk_publisher: i.Series.fk_publisher,
            }));
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
    async deleteSeries(item, transaction) {
        this.log(`Deleting series: ${item.title} (Vol. ${item.volume})`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (item.publisher?.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        let series = await this.models.Series.findOne({
            where: { title: (item.title || '').trim(), volume: item.volume, fk_publisher: pub.id },
            transaction,
        });
        if (!series) {
            throw new Error('Series not found');
        }
        return await series.deleteInstance(transaction, this.models);
    }
    async createSeries(item, transaction) {
        this.log(`Creating series: ${item.title} (Vol. ${item.volume})`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (item.publisher?.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        return await this.models.Series.create({
            title: (item.title || '').trim(),
            volume: item.volume,
            startyear: item.startyear,
            endyear: item.endyear,
            addinfo: item.addinfo,
            fk_publisher: pub.id,
        }, { transaction });
    }
    async editSeries(old, item, transaction) {
        this.log(`Editing series: ${old.title} -> ${item.title}`);
        let pub = await this.models.Publisher.findOne({
            where: { name: (old.publisher?.name || '').trim() },
            transaction,
        });
        if (!pub)
            throw new Error('Publisher not found');
        let res = await this.models.Series.findOne({
            where: { title: (old.title || '').trim(), volume: old.volume, fk_publisher: pub.id },
            transaction,
        });
        if (!res) {
            throw new Error('Series not found');
        }
        res.title = (item.title || '').trim();
        res.volume = item.volume || 0;
        res.startyear = item.startyear || 0;
        res.endyear = item.endyear || 0;
        res.addinfo = item.addinfo || '';
        return await res.save({ transaction });
    }
    async getSeriesByIds(ids) {
        const series = await this.models.Series.findAll({
            where: { id: { [sequelize_1.Op.in]: [...ids] } },
        });
        return ids.map((id) => series.find((s) => s.id === id) || null);
    }
}
exports.SeriesService = SeriesService;
