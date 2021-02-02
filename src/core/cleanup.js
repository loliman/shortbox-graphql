import models from '../models';
import {asyncForEach} from '../util/util';
import Sequelize from "sequelize";

let CronJob = require('cron').CronJob;

//Job will on every full hour
export const cleanup = new CronJob({
    cronTime: '0 3 * * *',
    onTick: () => {
        run();
    },
    start: false
});

export async function run() {
    const transaction = await models.sequelize.transaction();

    console.log("[" + (new Date()).toUTCString() + "] Starting cleanup...");
    try {
        let issues = await models.Issue.findAll({
            where: {
                '$Series->Publisher.original$': 1
            },
            group: ['fk_series', 'number'],
            include: [
                {
                    model: models.Series,
                    include: [
                        models.Publisher
                    ]
                }
            ],
            transaction
        });

        //Remove all stories and covers with no children
        let storyCount = 0;
        let coverCount = 0;
        await asyncForEach(issues, async (issue) => {
            let variants = await models.Issue.findAll({
                where: {
                    number: issue.number,
                    fk_series: issue.fk_series,
                },
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ],
                transaction
            });

            let del = true;
            await asyncForEach(variants, async (variant) => {
                let stories = await models.Story.findAll({where: {fk_issue: variant.id}, transaction});

                await asyncForEach(stories, async (story) => {
                    if(del) {
                        let c = await models.Story.count({where: {
                            fk_parent: story.id,
                            fk_reprint: {[Sequelize.Op.ne]: null}
                        }, transaction});
                        del = c === 0;
                    }
                });
            });

            if(del)
                await asyncForEach(variants, async (variant) => {
                    let stories = await models.Story.findAll({where: {
                        fk_issue: variant.id,
                        fk_reprint: {[Sequelize.Op.like]: null}
                    }, transaction});

                    await asyncForEach(stories, async(story) => {
                        await story.destroy({transaction});
                        storyCount++;
                    });
                });
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + storyCount + " stories.");

        //Remove all US Issues without content
        let issueCount = 0;
        await asyncForEach(issues, async (issue) => {
            let variants = await models.Issue.findAll({
                where: {
                    number: issue.number,
                    fk_series: issue.fk_series,
                },
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ],
                transaction
            });

            //only delete if variants are also empty
            let del = true;
            await asyncForEach(variants, async (variant) => {
                if(del) {
                    let c = await models.Cover.count({where: {fk_issue: variant.id}, transaction});
                    del = c === 0;
                }

                if(del) {
                    let c = await models.Story.count({where: {fk_issue: variant.id}, transaction});
                    del = c === 0;
                }
            });

            if(del)
                await asyncForEach(variants, async (variant) => {
                    await variant.destroy({transaction});
                    issueCount++;
                });
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + issueCount + " issues.");

        //Remove all US Series without issues
        let series = await models.Series.findAll({
            where: {
                '$Publisher.original$': 1
            },
            include: [models.Publisher],
            transaction
        });

        let seriesCount = 0;
        await asyncForEach(series, async (series) => {
            let c = await models.Issue.count({where: {fk_series: series.id}, transaction});
            let del = c === 0;

            if(del) {
                await series.destroy({transaction});
                seriesCount++;
            }
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + seriesCount + " series.");

        //Remove all US publishers without series
        let publishers = await models.Publisher.findAll({
            where: {
                original: 1
            },
            transaction
        });

        let publisherCount = 0;
        await asyncForEach(publishers, async (publisher) => {
            let c = await models.Series.count({where: {fk_publisher: publisher.id}, transaction});
            let del = c === 0;

            if(del) {
                await publisher.destroy({transaction});
                publisherCount++;
            }
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + publisherCount + " publishers.");

        //Remove all Individuals without content
        let individuals = await models.Individual.findAll({transaction});
        let individualCount = 0;
        await asyncForEach(individuals, async (individual) => {
            let c = await models.Cover_Individual.count({where: {fk_individual: individual.id}, transaction});
            let del = c === 0;

            if(del) {
                c = await models.Story_Individual.count({where: {fk_individual: individual.id}, transaction});
                del = c === 0;
            }

            if(del) {
                c = await models.Feature_Individual.count({where: {fk_individual: individual.id}, transaction});
                del = c === 0;
            }

            if(del) {
                c = await models.Issue_Individual.count({where: {fk_individual: individual.id}, transaction});
                del = c === 0;
            }

            if(del) {
                await individual.destroy({transaction});
                individualCount++;
            }
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + individualCount + " individuals.");

        //Remove all arcs without content
        let arcs = await models.Arc.findAll({transaction});
        let arcCount = 0;
        await asyncForEach(arcs, async (arc) => {
            let c = await models.Issue_Arc.count({where: {fk_arc: arc.id}, transaction});
            let del = c === 0;

            if(del) {
                await arc.destroy({transaction});
                arcCount++;
            }
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + arcCount + " arcs.");

        //Remove all appearances without content
        let apps = await models.Appearance.findAll({transaction});
        let appCount = 0;
        await asyncForEach(apps, async (app) => {
            let c = await models.Story_Appearance.count({where: {fk_appearance: app.id}, transaction});
            let del = c === 0;

            if(del) {
                await app.destroy({transaction});
                appCount++;
            }
        });
        console.log("[" + (new Date()).toUTCString() + "] Deleted " + appCount + " appearances.");

        await transaction.commit();
        console.log("[" + (new Date()).toUTCString() + "] Cleanup done.");
    } catch (e) {
        console.log(e);
        await transaction.rollback();
        console.log("[" + (new Date()).toUTCString() + "] Error during cleanup... rolling back.");
    }
}
