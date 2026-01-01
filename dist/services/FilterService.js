"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilterService = void 0;
const sequelize_1 = require("sequelize");
const util_1 = require("../util/util");
const graphql_1 = require("graphql");
const logger_1 = __importDefault(require("../util/logger"));
const dateFormat = require('dateformat');
class FilterService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        logger_1.default[level](message, { requestId: this.requestId });
    }
    async export(filter, type, loggedIn) {
        const options = this.getFilterOptions(loggedIn, filter, true);
        options.limit = 1000; // Export limit
        const issues = await this.models.Issue.findAll(options);
        let response = {};
        await (0, util_1.asyncForEach)(issues, async (issue) => {
            const p = issue.Series.Publisher;
            const s = issue.Series;
            let publisher = { name: p.name };
            let series = {
                title: s.title,
                volume: s.volume,
                startyear: s.startyear,
                endyear: s.endyear,
                publisher: publisher,
            };
            let issueData = {
                number: issue.number,
                format: issue.format,
                variant: issue.variant,
                pages: issue.pages,
                releasedate: issue.releasedate,
                price: issue.price,
                currency: issue.currency,
                series: series,
            };
            let publisherLabel = await (0, util_1.generateLabel)(publisher);
            let seriesLabel = await (0, util_1.generateLabel)(series);
            if (publisherLabel in response) {
                if (seriesLabel in response[publisherLabel])
                    response[publisherLabel][seriesLabel].push(issueData);
                else {
                    response[publisherLabel][seriesLabel] = [issueData];
                }
            }
            else {
                response[publisherLabel] = { [seriesLabel]: [issueData] };
            }
        });
        let sortedResponse = Object.keys(response)
            .map((key) => {
            let p = response[key];
            return [
                key,
                Object.keys(p)
                    .map((key) => {
                    let s = p[key];
                    return [
                        key,
                        s.sort((a, b) => (0, util_1.naturalCompare)(a.number, b.number)),
                    ];
                })
                    .sort(),
            ];
        })
            .sort();
        if (type === 'txt') {
            return JSON.stringify((await this.convertFilterToTxt(filter, loggedIn)) + (await this.resultsToTxt(sortedResponse)));
        }
        else if (type === 'csv') {
            return JSON.stringify(await this.resultsToCsv(sortedResponse, loggedIn));
        }
        else {
            throw new graphql_1.GraphQLError('Gültige Export Typen: txt, csv', {
                extensions: { code: 'BAD_USER_INPUT' },
            });
        }
    }
    getFilterOptions(loggedIn, filter, isExport = false, orderField = false, sortDirection = false) {
        const us = filter.us ? 1 : 0;
        const where = {};
        const include = [
            {
                model: this.models.Series,
                required: true,
                include: [
                    {
                        model: this.models.Publisher,
                        required: true,
                        where: { original: us },
                    },
                ],
            },
        ];
        if (filter.formats && filter.formats.length > 0) {
            where.format = { [sequelize_1.Op.in]: filter.formats };
        }
        if (filter.releasedates && filter.releasedates.length > 0) {
            filter.releasedates.forEach((rd) => {
                const dateStr = dateFormat(new Date(rd.date), 'yyyy-mm-dd');
                const op = rd.compare === '>=' ? sequelize_1.Op.gte : rd.compare === '<=' ? sequelize_1.Op.lte : rd.compare === '>' ? sequelize_1.Op.gt : rd.compare === '<' ? sequelize_1.Op.lt : sequelize_1.Op.eq;
                where.releasedate = { ...(where.releasedate || {}), [op]: dateStr };
            });
        }
        if (!filter.onlyCollected && filter.withVariants) {
            where.variant = { [sequelize_1.Op.ne]: '' };
        }
        if (filter.onlyCollected) {
            where.collected = true;
        }
        if (filter.onlyNotCollected) {
            where.collected = false;
        }
        if (filter.sellable) {
            where.format = { ...(where.format || {}), [sequelize_1.Op.ne]: 'Digital' };
        }
        // Story-based filters
        const storyConditions = [];
        if (filter.appearances) {
            storyConditions.push({
                [sequelize_1.Op.or]: [
                    { '$Stories.Appearances.name$': { [sequelize_1.Op.like]: `%${filter.appearances}%` } },
                    { '$Stories.Children.Appearances.name$': { [sequelize_1.Op.like]: `%${filter.appearances}%` } },
                ],
            });
        }
        if (filter.individuals && filter.individuals.length > 0) {
            const names = filter.individuals.map((ind) => ind.name);
            storyConditions.push({
                [sequelize_1.Op.or]: [
                    { '$Stories.Individuals.name$': { [sequelize_1.Op.in]: names } },
                    { '$Stories.Children.Individuals.name$': { [sequelize_1.Op.in]: names } },
                ],
            });
        }
        if (filter.firstPrint)
            storyConditions.push({ '$Stories.firstapp$': true });
        if (filter.exclusive)
            storyConditions.push({ '$Stories.firstapp$': true, '$Stories.onlyapp$': true });
        if (filter.onlyPrint)
            storyConditions.push({ '$Stories.onlyapp$': true });
        if (filter.onlyTb)
            storyConditions.push({ '$Stories.onlytb$': true });
        if (filter.reprint)
            storyConditions.push({ '$Stories.fk_reprint$': { [sequelize_1.Op.ne]: null } });
        if (filter.otherOnlyTb)
            storyConditions.push({ '$Stories.otheronlytb$': true });
        if (filter.noPrint)
            storyConditions.push({ '$Stories.firstapp$': false, '$Stories.onlyapp$': false });
        if (filter.onlyOnePrint)
            storyConditions.push({ '$Stories.onlyoneprint$': true });
        if (storyConditions.length > 0) {
            const storyInclude = {
                model: this.models.Story,
                as: 'Stories',
                required: true,
                include: [],
            };
            if (filter.appearances || filter.individuals) {
                storyInclude.include.push({ model: this.models.Appearance, as: 'Appearances', required: false });
                storyInclude.include.push({ model: this.models.Individual, as: 'Individuals', required: false });
                storyInclude.include.push({
                    model: this.models.Story,
                    as: 'Children',
                    required: false,
                    include: [
                        { model: this.models.Appearance, as: 'Appearances', required: false },
                        { model: this.models.Individual, as: 'Individuals', required: false },
                    ],
                });
            }
            include.push(storyInclude);
            if (filter.and) {
                where[sequelize_1.Op.and] = [...(where[sequelize_1.Op.and] || []), ...storyConditions];
            }
            else {
                where[sequelize_1.Op.or] = [...(where[sequelize_1.Op.or] || []), ...storyConditions];
            }
        }
        if (filter.arcs) {
            include.push({
                model: this.models.Arc,
                as: 'Arcs',
                required: true,
                where: { title: { [sequelize_1.Op.like]: `%${filter.arcs}%` } },
            });
        }
        if (filter.publishers && filter.publishers.length > 0) {
            const names = filter.publishers.map((p) => p.name);
            const condition = { '$Series.Publisher.name$': { [sequelize_1.Op.in]: names } };
            if (filter.and)
                where[sequelize_1.Op.and] = [...(where[sequelize_1.Op.and] || []), condition];
            else
                where[sequelize_1.Op.or] = [...(where[sequelize_1.Op.or] || []), condition];
        }
        if (filter.series && filter.series.length > 0) {
            const conditions = filter.series.map((s) => ({
                '$Series.title$': s.title,
                '$Series.volume$': s.volume,
            }));
            if (filter.and)
                where[sequelize_1.Op.and] = [...(where[sequelize_1.Op.and] || []), { [sequelize_1.Op.or]: conditions }];
            else
                where[sequelize_1.Op.or] = [...(where[sequelize_1.Op.or] || []), ...conditions];
        }
        if (filter.numbers && filter.numbers.length > 0) {
            const conditions = filter.numbers.map((n) => {
                const op = n.compare === '>=' ? sequelize_1.Op.gte : n.compare === '<=' ? sequelize_1.Op.lte : n.compare === '>' ? sequelize_1.Op.gt : n.compare === '<' ? sequelize_1.Op.lt : sequelize_1.Op.eq;
                const cond = { number: { [op]: n.number } };
                if (n.variant)
                    cond.variant = n.variant;
                return cond;
            });
            if (filter.and)
                where[sequelize_1.Op.and] = [...(where[sequelize_1.Op.and] || []), { [sequelize_1.Op.or]: conditions }];
            else
                where[sequelize_1.Op.or] = [...(where[sequelize_1.Op.or] || []), ...conditions];
        }
        if (filter.noCover) {
            include.push({
                model: this.models.Cover,
                as: 'Covers',
                required: false,
            });
            const condition = { '$Covers.id$': null };
            if (filter.and)
                where[sequelize_1.Op.and] = [...(where[sequelize_1.Op.and] || []), condition];
            else
                where[sequelize_1.Op.or] = [...(where[sequelize_1.Op.or] || []), condition];
        }
        if (filter.noContent) {
            if (!include.find((inc) => inc.as === 'Stories')) {
                include.push({ model: this.models.Story, as: 'Stories', required: false });
            }
            const condition = { '$Stories.id$': null };
            if (filter.and)
                where[sequelize_1.Op.and] = [...(where[sequelize_1.Op.and] || []), condition];
            else
                where[sequelize_1.Op.or] = [...(where[sequelize_1.Op.or] || []), condition];
        }
        let order = [];
        if (orderField) {
            order = [[String(orderField), String(sortDirection || 'ASC')]];
        }
        else if (isExport) {
            order = [
                ['$Series.Publisher.name$', 'ASC'],
                ['$Series.title$', 'ASC'],
                ['$Series.volume$', 'ASC'],
                ['number', 'ASC'],
            ];
        }
        return {
            where,
            include,
            order,
            subQuery: false, // Essential when using limit with includes
        };
    }
    async resultsToCsv(results, loggedIn) {
        let responseString = 'Verlag;Series;Volume;Start;Ende;Nummer;Variante;Format;Seiten;Erscheinungsdaten;Preis;Währung\n';
        results.forEach((p) => {
            p[1].forEach((s) => {
                s[1].forEach((i) => {
                    responseString +=
                        i.series.publisher.name +
                            '\t;' +
                            i.series.title +
                            '\t;' +
                            i.series.volume +
                            '\t;' +
                            i.series.startyear +
                            '\t;' +
                            i.series.endyear +
                            '\t;' +
                            i.number +
                            '\t;' +
                            i.variant +
                            '\t;' +
                            i.format +
                            '\t;' +
                            i.pages +
                            '\t;' +
                            i.releasedate +
                            '\t;' +
                            (i.price + '').replace('.', ',') +
                            '\t;' +
                            i.currency +
                            '\n';
                });
            });
        });
        return responseString;
    }
    async resultsToTxt(results) {
        let responseString = '';
        results.forEach((p) => {
            responseString += p[0] + '\n';
            p[1].forEach((s) => {
                responseString += '\t' + s[0] + '\n';
                s[1].forEach((i) => {
                    responseString += '\t\t#' + i.number + '\n';
                });
            });
            responseString += '\n';
        });
        return responseString;
    }
    async convertFilterToTxt(filter, loggedIn) {
        let s = 'Aktive Filter\n';
        s += '\t' + (filter.us ? 'Original Ausgaben' : 'Deutsche Ausgaben') + '\n';
        s += '\tDetails\n';
        if (filter.formats) {
            s += '\t\tFormat: ';
            filter.formats.forEach((f) => (s += (f || '') + ', '));
            s = s.substr(0, s.length - 2) + '\n';
        }
        if (filter.withVariants)
            s += '\t\tmit Varianten\n';
        if (filter.releasedates) {
            s += '\t\tErscheinungsdatum: ';
            filter.releasedates.forEach((r) => (s += dateFormat(new Date(r.date), 'dd.mm.yyyy') + ' ' + r.compare + ', '));
            s = s.substr(0, s.length - 2) + '\n';
        }
        if (!filter.formats && !filter.withVariants && !filter.releasedates)
            s += '\t\t-\n';
        if (filter.and)
            s += '\tAlle Kriterien müssen erfüllt sein\n';
        if (filter.noCover)
            s += '\tOhne Cover\n';
        if (filter.noContent)
            s += '\tOhne Inhalt\n';
        s += '\tEnthält\n';
        if (filter.firstPrint)
            s += '\t\tErstausgabe\n';
        if (filter.onlyPrint)
            s += '\t\tEinzige Ausgabe\n';
        if (filter.onlyTb)
            s += '\t\tNur in TB\n';
        if (filter.exclusive)
            s += '\t\tExclusiv\n';
        if (filter.reprint)
            s += '\t\tReiner Nachdruck\n';
        if (filter.otherOnlyTb)
            s += '\t\tNur in TB\n';
        if (filter.noPrint)
            s += '\t\tKeine Ausgabe\n';
        if (filter.onlyOnePrint)
            s += '\t\tEinzige Ausgabe\n';
        if (filter.onlyCollected)
            s += '\t\tGesammelt\n';
        if (filter.onlyNotCollected)
            s += '\t\tNicht gesammelt\n';
        if (filter.sellable)
            s += '\t\tVerkaufbar\n';
        if (filter.publishers) {
            s += '\tVerlag: ';
            filter.publishers.forEach((p) => (s += p.name + ', '));
            s = s.substr(0, s.length - 2) + '\n';
        }
        if (filter.series) {
            s += '\tSerie: ';
            filter.series.forEach((n) => (s += n.title + ' (Vol. ' + n.volume + '), '));
            s = s.substr(0, s.length - 2) + '\n';
        }
        if (filter.numbers) {
            s += '\tNummer: ';
            filter.numbers.forEach((n) => {
                s += '#' + n.number;
                if (n.variant)
                    s += ' (' + n.variant + ')';
                s += ' ' + n.compare + ', ';
            });
            s = s.substr(0, s.length - 2) + '\n';
        }
        if (filter.arcs) {
            s += '\tStory Arc: ' + filter.arcs + '\n';
        }
        if (filter.individuals) {
            s += '\tMitwirkende: ';
            filter.individuals.forEach((i) => (s += i.name + ', '));
            s = s.substr(0, s.length - 2) + '\n';
        }
        if (filter.appearances) {
            s += '\tAuftritte: ' + filter.appearances + '\n';
        }
        return s;
    }
}
exports.FilterService = FilterService;
