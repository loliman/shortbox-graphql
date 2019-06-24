import migration from "../models";
import models from "../../models";
import {asyncForEach, romanize} from "../../util/util";
import fs from 'fs';
import {create} from "../../models/Issue";
import {create as createArc} from "../../models/Arc";
import {crawlIssue, crawlSeries} from "../../core/crawler";
import {afterFirstMigration} from "../../config/config";

var stream;

export async function fixUsSeries() {
    return new Promise(async (resolve, reject) => {
        try {
            let series = await models.Series.findAll({
                where: {startyear: 0}
            });

            await asyncForEach(series, async (s, i, a) => {
                console.log("[" + (new Date()).toUTCString() + "] Fixing series " + (i+1) + " of " + a.length);

                let crawledSeries = await crawlSeries(s);

                s.startyear = crawledSeries.startyear;
                s.endyear = crawledSeries.endyear;

                await s.save();
            });

            console.log("[" + (new Date()).toUTCString() + "] Done fixing series.");
            resolve(true);
        } catch (e) {
            console.log(e);
            //Don't reject, errors are okay
            resolve(false);
        }
    });
}

export async function fixUsComics() {
    return new Promise(async (resolve, reject) => {
        try {
            let issues = await models.Issue.findAll({
                where: {
                    '$Series->Publisher.original$': 1,
                    variant: ''
                },
                include: [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
            });

            await asyncForEach(issues, async (i, idx, a) => {
                try {
                    console.log("[" + (new Date()).toUTCString() + "] Fixing issue " + (idx+1) + " of " + a.length);

                    i.series = await models.Series.findOne({where: {id: i.fk_series}});

                    let crawledIssue = await crawlIssue(i).catch(() => {/*ignore errors while crawling*/});

                    await asyncForEach(crawledIssue.variants, async variant => {
                        let res = await models.Issue.findAll({
                            where: {
                                fk_series: i.fk_series,
                                number: i.number,
                                variant: variant.variant,
                            }
                        });

                        if(!res) {
                            console.log("[" + (new Date()).toUTCString() + "] " + i.series.title + " (Vol. " + i.series.volume + ") #" + i.number +
                                " is missing variant " + variant.variant);

                            let newVariant = await models.Issue.create({title: '',
                                number: i.number,
                                format: 'Heft',
                                variant: variant.variant,
                                fk_series: i.fk_series,
                                releasedate: i.releasedate,
                                limitation: 0,
                                pages: 0,
                                price: 0,
                                currency: i.currency ? i.currency : 'USD',
                                addinfo: ''
                            });

                            await asyncForEach(crawledIssue.editors, async (editor) => {
                                await newVariant.associateIndividual(editor.name.trim(), 'EDITOR');
                            });
                            await newVariant.save();

                            let newCover = await models.Cover.create({
                                url: crawledVariant.cover.url,
                                number: 0,
                                addinfo: ''
                            });

                            await newCover.setIssue(newVariant);
                            await newCover.save();
                        }
                    });

                    /*if(crawledIssue.arcs && crawledIssue.arcs.length > 0) {
                        await asyncForEach(crawledIssue.arcs, async arc => {
                            try {
                                await createArc(arc, i);
                            } catch (e) {
                                //ignore, might already exist
                            }
                        });
                    }*/

                    let stories = await models.Story.findAll({
                        where: {fk_issue: i.id}
                    });

                    if(stories.length > 0 && crawledIssue.stories.length !== stories.length) {
                        let failed = false;

                        for(let i = 0; i < stories.length; i++) {
                            if (stories[i].title !== crawledIssue.stories[i].title) {
                                console.log("[" + (new Date()).toUTCString() + "] " + i.series.title + " (Vol. " + i.series.volume + ") #" + i.number +
                                    " is missing story as story in between [" + romanize(i + 1) + "]");

                                failed = true;
                            }
                        }

                        if(!failed) {
                            await Promise.all(crawledIssue.stories.map(async (crawledStory) => {
                                if(stories.length >= crawledStory.number)
                                    return;

                                let newStory = await models.Story.create({
                                    title: crawledStory.title ? crawledStory.title : '',
                                    number: !isNaN(crawledStory.number) ? crawledStory.number : 1,
                                    addinfo: ''
                                });

                                await asyncForEach(crawledStory.individuals, async (individual) => {
                                    await newStory.associateIndividual(individual.name.trim(), individual.type, null);
                                });

                                await newStory.setIssue(i);
                                await newStory.save();

                                return newStory;
                            }));
                        }
                    } else if(stories.length > 0 && crawledIssue.stories.length > 0) {
                        await asyncForEach(crawledIssue.stories, async (crawledStory, i) => {
                            if(crawledStory.appearing && crawledStory.appearing.length > 0) {
                                await asyncForEach(crawledStory.appearing, async appearance => {
                                    await stories[i].associateAppearance(appearance.name, appearance.type, appearance.role, null);
                                });
                            }
                        });
                    }
                } catch (e) {
                    /*ignore errors while crawling*/
                }
            });

            console.log("[" + (new Date()).toUTCString() + "] Done fixing issues.");
            resolve(true);
        } catch (e) {
            console.log(e);
            //Don't reject, errors are okay
            resolve(false);
        }
    });
}

export async function migrate() {
    return new Promise(async (resolve, reject) => {
        stream = fs.createWriteStream("migration.log", {flags: 'a'});

        try {
            await migratePublishers();
            await migrateSeries();
            await migrateIssues();

            resolve(true);
        } catch (e) {
            //Don't reject, errors are okay
            resolve(false);
        } finally {
            if (stream)
                stream.end();
        }
    });
}

async function migrateIssues() {
    return new Promise(async (resolve, reject) => {
        try {
            let issues = await migration.Issue.findAll({
                where: {originalissue: 0}
            });

            //let issues = [];
            //issues.push(await migration.Issue.findOne({where: {id: 2863}}));

            await asyncForEach(issues, async (issue, index, array) => {
                let issueToCreate = {};
                let variant = '';

                try {
                    issueToCreate.title = issue.title;
                    issueToCreate.number = issue.number;
                    issueToCreate.format = issue.format;
                    issueToCreate.variant = issue.variant;
                    issueToCreate.pages = issue.pages;
                    issueToCreate.releasedate = issue.releasedate;
                    issueToCreate.price = issue.price;
                    issueToCreate.currency = issue.currency;

                    let variant = issueToCreate.format || issueToCreate.variant ? " [" : "";
                    if (issueToCreate.format)
                        variant += issueToCreate.format;

                    if (variant !== "" && issueToCreate.variant)
                        variant += "/";

                    if (issueToCreate.variant)
                        variant += issueToCreate.variant;

                    if (variant !== "")
                        variant += "]";

                    let series;
                    let publisher;
                    if(afterFirstMigration) {
                        series = await models.Series.findOne({
                            where: {id: issue.fk_series}
                        });

                        if(!series)
                            return;

                        publisher = await models.Publisher.findOne({
                            where: {id: series.fk_publisher}
                        });

                        if(!publisher)
                            return;
                    } else {
                        series = await migration.Series.findOne({
                            where: {id: issue.fk_series}
                        });

                        publisher = await migration.Publisher.findOne({
                            where: {id: series.fk_publisher}
                        });
                    }

                    issueToCreate.series = {
                        title: series.title,
                        volume: series.volume,
                        publisher: {
                            name: publisher.name
                        }
                    };

                    console.log("[" + (new Date()).toUTCString() + " ID#" + issue.id + "] Migrating issue " + issueToCreate.series.title + " (Vol." + issueToCreate.series.volume + ") " + issueToCreate.number + variant + " (" + (index+1) + " of " + array.length + ")");

                    issueToCreate.stories = [];
                    let stories = await migration.Story.findAll({
                        include: [{
                            model: migration.Issue
                        }],
                        where: {
                            '$Issues->Issue_Story.fk_issue$': issue.id
                        }
                    });

                    await asyncForEach(stories, async story => {
                        let parent = await migration.Story.findOne({
                            include: [{
                                model: migration.Issue,
                                where: {
                                    originalissue: 1
                                }
                            }],
                            where: {
                                id: story.id
                            }
                        });

                        if(!parent)
                            throw Error('No parent found for story ' + story.number  + " [ID#" + story.id + "]");
                        
                        let parentIssue;
                        let parentIssues = await parent.getIssues();
                        await asyncForEach(parentIssues, async p => {
                            if (p.originalissue === 1)
                                parentIssue = p;
                        });

                        let parentSeries = await migration.Series.findOne({
                            where: {id: parentIssue.fk_series}
                        });

                        if(!parentIssue)
                            throw Error('No issue found for parent ' + parentSeries.title + " (Vol." + parentSeries.volume + ") [ID#" + parentIssue.id + "]");

                        if(parentIssue.number === '')
                            throw Error('No issue number found for parent ' + parentSeries.title + " (Vol." + parentSeries.volume + ") [ID#" + parentIssue.id + "]");

                        let storyObj = {
                            number: issueToCreate.stories.length + 1,
                            addinfo: story.additionalInfo,
                            parent: {
                                number: parent.number === 0 ? 1 : parent.number,
                                issue: {
                                    number: parentIssue.number,
                                    series: {
                                        title: parentSeries.title,
                                        volume: parentSeries.volume
                                    }
                                }
                            }
                        };

                        issueToCreate.stories.push(storyObj);
                    });

                    let where = {
                        fk_series: issue.fk_series,
                        number: issueToCreate.number
                    };

                    if(afterFirstMigration) {
                        switch (issueToCreate.format) {
                            case "Heft/Variant":
                                where.format = "Heft";
                                break;
                            case "Softcover/Variant":
                                where.format = "Softcover";
                                break;
                            case "Hardcover/Variant":
                                where.format = "Hardcover";
                                break;
                            case "Softcover/Album":
                                where.format = "Album";
                                break;
                            case "Hardcover/Album":
                                where.format = "Album Hardcover";
                                break;
                            default:
                                where.format = issueToCreate.format;
                        }
                    } else {
                        if (issueToCreate.format)
                            where.format = issueToCreate.format;
                    }

                    if (issueToCreate.variant)
                        where.variant = issueToCreate.variant;

                    let i = await models.Issue.findOne({where: where});

                    if (!i) {
                        let transaction = await models.sequelize.transaction();

                        let res = await create(issueToCreate, transaction).catch(async (e) => {
                            stream.write("[" + (new Date()).toUTCString() + " ID#" + issue.id + "] Migrating issue " + issueToCreate.series.title + " (Vol." + issueToCreate.series.volume + ") " + issueToCreate.number + variant + " unsuccessful ");
                            stream.write("[ERROR: " + e + "]\n");

                            await transaction.rollback();
                        });

                        if(res)
                            await transaction.commit();
                    }
                } catch (e) {
                    console.log(e);
                    stream.write("[" + (new Date()).toUTCString() + " ID#" + issue.id + "] Migrating issue " + issueToCreate.series.title + " (Vol." + issueToCreate.series.volume + ") " + issueToCreate.number + variant + " unsuccessful ");
                    stream.write("[ERROR: " + e + "]\n");
                }
            });

            resolve(true);
        } catch (e) {
            console.log(e);
            resolve(false);
        }
    });
}

async function migratePublishers() {
    return new Promise(async (resolve, reject) => {
        let migrationTransaction = await migration.migrationDatabase.transaction();
        let transaction = await models.sequelize.transaction();

        try {
            let publishers = await migration.Publisher.findAll({
                where: {'$Series.original$': 0},
                include: [migration.Series],
                migrationTransaction
            });

            await asyncForEach(publishers, async publisher => {
                let p = await models.Publisher.findOne({where: {id: publisher.id}, transaction: transaction});

                if(!p)
                    await models.Publisher.create({
                        id: publisher.id,
                        name: publisher.name,
                        original: 0
                    }, {transaction: transaction});
            });

            await transaction.commit();
            resolve(true);
        } catch (e) {
            await transaction.rollback();
            resolve(false);
        }
    });
}

async function migrateSeries() {
    return new Promise(async (resolve, reject) => {
        let migrationTransaction = await migration.migrationDatabase.transaction();
        let transaction = await models.sequelize.transaction();

        try {
            let series = await migration.Series.findAll({
                where: {original: 0},
                migrationTransaction
            });

            await asyncForEach(series, async series => {
                let s = await models.Series.findOne({where: {id: series.id}, transaction: transaction});

                if(!s)
                    await models.Series.create({
                        id: series.id,
                        title: series.title,
                        startyear: series.startyear,
                        endyear: series.endyear,
                        volume: series.volume,
                        fk_publisher: series.fk_publisher
                    }, {transaction: transaction});
            });

            await transaction.commit();
            resolve(true);
        } catch (e) {
            await transaction.rollback();
            resolve(false);
        }
    });
}