"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanup = void 0;
exports.run = run;
const models_1 = __importDefault(require("../models"));
const util_1 = require("../util/util");
const cron_1 = require("cron");
const logger_1 = __importDefault(require("../util/logger"));
//Job will on every full hour
exports.cleanup = new cron_1.CronJob('0 3 * * *', () => {
    run();
}, null, false);
async function run() {
    const transaction = await models_1.default.sequelize.transaction();
    logger_1.default.info('Starting cleanup...');
    try {
        let issues = await models_1.default.Issue.findAll({
            where: {
                '$Series->Publisher.original$': 1,
            },
            group: ['fk_series', 'number'],
            include: [
                {
                    model: models_1.default.Series,
                    include: [models_1.default.Publisher],
                },
            ],
            transaction,
        });
        //Remove all stories and covers with no children
        let storyCount = 0;
        let coverCount = 0;
        await (0, util_1.asyncForEach)(issues, async (issue) => {
            let variants = await models_1.default.Issue.findAll({
                where: {
                    number: issue.number,
                    fk_series: issue.fk_series,
                },
                include: [
                    {
                        model: models_1.default.Series,
                        include: [models_1.default.Publisher],
                    },
                ],
                transaction,
            });
            let del = true;
            await (0, util_1.asyncForEach)(variants, async (variant) => {
                let covers = await models_1.default.Cover.findAll({
                    where: { fk_issue: variant.id },
                    transaction,
                });
                await (0, util_1.asyncForEach)(covers, async (cover) => {
                    if (del) {
                        let c = await models_1.default.Cover.count({
                            where: { fk_parent: cover.id },
                            transaction,
                        });
                        del = c === 0;
                    }
                });
                if (del) {
                    let stories = await models_1.default.Story.findAll({
                        where: { fk_issue: variant.id },
                        transaction,
                    });
                    await (0, util_1.asyncForEach)(stories, async (story) => {
                        if (del) {
                            let c = await models_1.default.Story.count({
                                where: { fk_parent: story.id },
                                transaction,
                            });
                            del = c === 0;
                        }
                    });
                }
            });
            if (del)
                await (0, util_1.asyncForEach)(variants, async (variant) => {
                    let covers = await models_1.default.Cover.findAll({
                        where: { fk_issue: variant.id },
                        transaction,
                    });
                    await (0, util_1.asyncForEach)(covers, async (cover) => {
                        await cover.destroy({ transaction });
                        coverCount++;
                    });
                    let stories = await models_1.default.Story.findAll({
                        where: { fk_issue: variant.id },
                        transaction,
                    });
                    await (0, util_1.asyncForEach)(stories, async (story) => {
                        await story.destroy({ transaction });
                        storyCount++;
                    });
                });
        });
        logger_1.default.info(`Deleted ${coverCount} covers.`);
        logger_1.default.info(`Deleted ${storyCount} stories.`);
        //Remove all US Issues without content
        let issueCount = 0;
        await (0, util_1.asyncForEach)(issues, async (issue) => {
            let variants = await models_1.default.Issue.findAll({
                where: {
                    number: issue.number,
                    fk_series: issue.fk_series,
                },
                include: [
                    {
                        model: models_1.default.Series,
                        include: [models_1.default.Publisher],
                    },
                ],
                transaction,
            });
            //only delete if variants are also empty
            let del = true;
            await (0, util_1.asyncForEach)(variants, async (variant) => {
                if (del) {
                    let c = await models_1.default.Cover.count({
                        where: { fk_issue: variant.id },
                        transaction,
                    });
                    del = c === 0;
                }
                if (del) {
                    let c = await models_1.default.Story.count({
                        where: { fk_issue: variant.id },
                        transaction,
                    });
                    del = c === 0;
                }
            });
            if (del)
                await (0, util_1.asyncForEach)(variants, async (variant) => {
                    await variant.destroy({ transaction });
                    issueCount++;
                });
        });
        logger_1.default.info(`Deleted ${issueCount} issues.`);
        //Remove all US Series without issues
        let series = await models_1.default.Series.findAll({
            where: {
                '$Publisher.original$': 1,
            },
            include: [models_1.default.Publisher],
            transaction,
        });
        let seriesCount = 0;
        await (0, util_1.asyncForEach)(series, async (seriesItem) => {
            let c = await models_1.default.Issue.count({
                where: { fk_series: seriesItem.id },
                transaction,
            });
            let del = c === 0;
            if (del) {
                await seriesItem.destroy({ transaction });
                seriesCount++;
            }
        });
        logger_1.default.info(`Deleted ${seriesCount} series.`);
        //Remove all US publishers without series
        let publishers = await models_1.default.Publisher.findAll({
            where: {
                original: 1,
            },
            transaction,
        });
        let publisherCount = 0;
        await (0, util_1.asyncForEach)(publishers, async (publisher) => {
            let c = await models_1.default.Series.count({
                where: { fk_publisher: publisher.id },
                transaction,
            });
            let del = c === 0;
            if (del) {
                await publisher.destroy({ transaction });
                publisherCount++;
            }
        });
        logger_1.default.info(`Deleted ${publisherCount} publishers.`);
        //Remove all Individuals without content
        let individuals = await models_1.default.Individual.findAll({ transaction });
        let individualCount = 0;
        await (0, util_1.asyncForEach)(individuals, async (individual) => {
            let c = await models_1.default.Cover_Individual.count({
                where: { fk_individual: individual.id },
                transaction,
            });
            let del = c === 0;
            if (del) {
                c = await models_1.default.Story_Individual.count({
                    where: { fk_individual: individual.id },
                    transaction,
                });
                del = c === 0;
            }
            if (del) {
                c = await models_1.default.Feature_Individual.count({
                    where: { fk_individual: individual.id },
                    transaction,
                });
                del = c === 0;
            }
            if (del) {
                c = await models_1.default.Issue_Individual.count({
                    where: { fk_individual: individual.id },
                    transaction,
                });
                del = c === 0;
            }
            if (del) {
                await individual.destroy({ transaction });
                individualCount++;
            }
        });
        logger_1.default.info(`Deleted ${individualCount} individuals.`);
        //Remove all arcs without content
        let arcs = await models_1.default.Arc.findAll({ transaction });
        let arcCount = 0;
        await (0, util_1.asyncForEach)(arcs, async (arc) => {
            let c = await models_1.default.Issue_Arc.count({ where: { fk_arc: arc.id }, transaction });
            let del = c === 0;
            if (del) {
                await arc.destroy({ transaction });
                arcCount++;
            }
        });
        logger_1.default.info(`Deleted ${arcCount} arcs.`);
        await transaction.commit();
        logger_1.default.info('Cleanup done.');
    }
    catch (e) {
        logger_1.default.error('Error during cleanup:', e);
        await transaction.rollback();
        logger_1.default.info('Error during cleanup... rolling back.');
    }
}
