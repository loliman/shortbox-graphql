import migration from "../models";
import models from "../../models";
import {asyncForEach} from "../../util/util";
import fs from 'fs';
import {create, findOrCrawlIssue, updateStoryTags} from "../../models/Issue";
import {crawlIssue, crawlSeries} from "../../crawler/crawler_marvel";
import {afterFirstMigration} from "../../config/config";

var stream;
var out;

export async function updateTags() {
    return new Promise(async (resolve, reject) => {
        try {
            out = fs.createWriteStream("logs/out.log", {flags: 'a'});

            let issues = await models.Issue.findAll({
                where: {
                    '$Series->Publisher.original$': 0
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
                let transaction = await models.sequelize.transaction();
                let crawledIssue;

                try {
                    i.series = await models.Series.findOne({where: {id: i.fk_series}, transaction});

                    out.write("[" + (new Date()).toUTCString() + "] Fixing issue " + (idx + 1) + " of " + a.length + " " +
                        "(" + i.series.title + " (Vol. " + i.series.volume + ") #" + i.number + ")\n");

                    await updateStoryTags(i, transaction);

                    await transaction.commit();
                } catch (e) {
                    if (crawledIssue && crawledIssue.series && crawledIssue.series.publisher)
                        out.write("[" + (new Date()).toUTCString() + "] ERROR Fixing issue "
                            + crawledIssue.series.title + " (Vol. " + crawledIssue.series.volume
                            + ") #" + crawledIssue.number + " (" + crawledIssue.series.publisher.name + ")\n");
                    else
                        out.write("[" + (new Date()).toUTCString() + "] ERROR Fixing issue "
                            + i.series.title + " (Vol. " + i.series.volume
                            + ") #" + i.number + " (issue not found)\n");

                    await transaction.commit();
                }
            })
        } catch (e) {
            console.log(e);
            //Don't reject, errors are okay
            resolve(false);
        } finally {
            if (out)
                out.end();
        }
    });
}

export async function addReprints() {
    return new Promise(async (resolve, reject) => {
        try {
            out = fs.createWriteStream("logs/out.log", {flags: 'a'});

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
                let transaction = await models.sequelize.transaction();
                let crawledIssue;

                try {
                    i.series = await models.Series.findOne({where: {id: i.fk_series}, transaction});

                    out.write("[" + (new Date()).toUTCString() + "] Fixing issue " + (idx + 1) + " of " + a.length + " " +
                        "(" + i.series.title + " (Vol. " + i.series.volume + ") #" + i.number + ")\n");

                    crawledIssue = await crawlIssue(i.number, i.series.title, i.series.volume).catch(() => {/*ignore errors while crawling*/
                    });

                    let stories = await models.Story.findAll({
                        where: {fk_issue: i.id},
                        order: [['number', 'ASC']],
                        transaction
                    })

                    if (stories.length === crawledIssue.stories.length) {
                        await asyncForEach(crawledIssue.stories, async (story, i) => {
                            if (story.reprintOf) {
                                console.log("Reprint found!");
                                let crawledReprint = await findOrCrawlIssue(story.reprintOf.issue, transaction);
                                let crawledStories = await models.Story.findAll({
                                    where: {fk_issue: crawledReprint.id},
                                    order: [['number', 'ASC']],
                                    transaction
                                })

                                stories[i].fk_reprint = crawledStories[story.reprintOf.number - 1].id;
                                await stories[i].save({transaction: transaction});
                            }
                        });
                    }

                    await transaction.commit();
                } catch (e) {
                    if (crawledIssue && crawledIssue.series && crawledIssue.series.publisher)
                        out.write("[" + (new Date()).toUTCString() + "] ERROR Fixing issue "
                            + crawledIssue.series.title + " (Vol. " + crawledIssue.series.volume
                            + ") #" + crawledIssue.number + " (" + crawledIssue.series.publisher.name + ")\n");
                    else
                        out.write("[" + (new Date()).toUTCString() + "] ERROR Fixing issue "
                            + i.series.title + " (Vol. " + i.series.volume
                            + ") #" + i.number + " (issue not found)\n");

                    await transaction.rollback();
                }
            });
        } catch (e) {
            console.log(e);
            //Don't reject, errors are okay
            resolve(false);
        } finally {
            if (out)
                out.end();
        }
    });
}

export async function fixUsSeries() {
    return new Promise(async (resolve, reject) => {
        try {
            stream = fs.createWriteStream("fixing.log", {flags: 'a'});
            out = fs.createWriteStream("out.log", {flags: 'a'});

            let series = await models.Series.findAll({
                where: {
                    '$Publisher.original$': 1,
                },
                include: [
                    models.Publisher
                ]
            });

            await asyncForEach(series, async (s, i, a) => {
                let issue = {series: s};

                try {
                    out.write("[" + (new Date()).toUTCString() + "] Fixing series " + (i + 1) + " of " + a.length +
                        " (" + issue.series.title + " (Vol. " + issue.series.volume + "))\n");


                    await crawlSeries(issue);

                    s.startyear = issue.series.startyear;
                    s.endyear = issue.series.endyear;

                    await s.save();
                } catch (e) {
                    if (issue.series && issue.series.publisher)
                        stream.write("[" + (new Date()).toUTCString() + "] ERROR Fixing series "
                            + issue.series.title + " (Vol. " + issue.series.volume
                            + ") (" + issue.series.publisher.name + ")\n");
                    else
                        stream.write("[" + (new Date()).toUTCString() + "] ERROR Fixing series "
                            + issue.series.title + " (Vol. " + issue.series.volume
                            + ") (series not found)\n");
                }
            });

            console.log("[" + (new Date()).toUTCString() + "] Done fixing series.");
            resolve(true);
        } catch (e) {
            console.log(e);
            //Don't reject, errors are okay
            resolve(false);
        } finally {
            if (stream)
                stream.end();
            if (out)
                out.end();
        }
    });
}

export async function fixUsComics() {
    return new Promise(async (resolve, reject) => {
        try {
            stream = fs.createWriteStream("fixing.log", {flags: 'a'});
            out = fs.createWriteStream("out.log", {flags: 'a'});

            let issues = await models.Issue.findAll({
                where: {
                    //number: '39',
                    '$Series.title$': 'Spider-Gwen',
                    //'$Series.volume$': 1,
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
                let transaction = await models.sequelize.transaction();
                let crawledIssue;

                try {
                    i.series = await models.Series.findOne({where: {id: i.fk_series}, transaction});

                    out.write("[" + (new Date()).toUTCString() + "] Fixing issue " + (idx + 1) + " of " + a.length + " " +
                        "(" + i.series.title + " (Vol. " + i.series.volume + ") #" + i.number + ")\n");

                    crawledIssue = await crawlIssue(i.number, i.series.title, i.series.volume).catch(() => {/*ignore errors while crawling*/
                    });

                    let res = await models.Issue.findOne({
                        where: {
                            number: crawledIssue.number.trim(),
                            variant: '',
                            '$Series.title$': crawledIssue.series.title.trim(),
                            '$Series.volume$': crawledIssue.series.volume,
                            '$Series->Publisher.name$': crawledIssue.series.publisher.name.trim()
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

                    await fixIssue(res, crawledIssue, transaction);

                    let variants = await models.Issue.findAll({
                        where: {
                            number: crawledIssue.number.trim(),
                            '$Series.title$': crawledIssue.series.title.trim(),
                            '$Series.volume$': crawledIssue.series.volume,
                            '$Series->Publisher.name$': crawledIssue.series.publisher.name.trim()
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

                    await asyncForEach(variants, async (variant) => {
                        if (variant.variant !== '') {
                            await variant.delete(transaction);
                        }
                    });

                    await asyncForEach(crawledIssue.variants, async (variant) => {
                        let res = await models.Issue.findOne({
                            where: {
                                number: variant.number.trim(),
                                variant: variant.variant,
                                '$Series.title$': variant.series.title.trim(),
                                '$Series.volume$': variant.series.volume,
                                '$Series->Publisher.name$': variant.series.publisher.name.trim()
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

                        if (!res) {
                            let releasedate = variant.releasedate;
                            if (parseInt(releasedate.toLocaleString().substring(0, 4)) < variant.series.startyear)
                                releasedate.setFullYear(variant.series.startyear);

                            res = await models.Issue.create({
                                title: variant.title ? variant.title.trim() : '',
                                fk_series: i.series.id,
                                number: variant.number.trim(),
                                format: variant.format ? variant.format.trim() : '',
                                variant: variant.variant ? variant.variant.trim() : '',
                                limitation: !isNaN(variant.limitation) ? variant.limitation : 0,
                                pages: !isNaN(variant.pages) ? variant.pages : 0,
                                releasedate: releasedate,
                                price: !isNaN(variant.price) && variant.price !== '' ? variant.price : '0',
                                currency: variant.currency ? variant.currency.trim() : '',
                                addinfo: variant.addinfo
                            }, {transaction: transaction});

                            res = await res.save({transaction: transaction});

                            let cover = await models.Cover.create({
                                number: 0,
                                url: variant.cover.url
                            }, {transaction: transaction});

                            cover = await cover.save({transaction: transaction});

                            await cover.setIssue(res, {transaction: transaction});
                            await cover.save({transaction: transaction});
                        }

                        variant.individuals = crawledIssue.individuals;

                        await fixIssue(res, variant, transaction);
                    })

                    await transaction.commit();
                } catch (e) {
                    if (crawledIssue && crawledIssue.series && crawledIssue.series.publisher)
                        stream.write("[" + (new Date()).toUTCString() + "] ERROR Fixing issue "
                            + crawledIssue.series.title + " (Vol. " + crawledIssue.series.volume
                            + ") #" + crawledIssue.number + " (" + crawledIssue.series.publisher.name + ")\n");
                    else
                        stream.write("[" + (new Date()).toUTCString() + "] ERROR Fixing issue "
                            + i.series.title + " (Vol. " + i.series.volume
                            + ") #" + i.number + " (issue not found)\n");

                    await transaction.rollback();
                }
            });

            console.log("[" + (new Date()).toUTCString() + "] Done fixing issues.");
            resolve(true);
        } catch (e) {
            console.log(e);
            //Don't reject, errors are okay
            resolve(false);
        } finally {
            if (stream)
                stream.end();
            if (out)
                out.end();
        }
    });
}

async function fixIssue(res, crawledIssue, transaction) {
    try {
        res.title = crawledIssue.title ? crawledIssue.title.trim() : '';
        res.number = crawledIssue.number.trim();
        res.format = crawledIssue.format ? crawledIssue.format.trim() : 'Heft';
        res.variant = crawledIssue.variant ? crawledIssue.variant.trim() : '';
        res.limitation = crawledIssue.limitation;
        res.pages = crawledIssue.pages;
        res.releasedate = crawledIssue.releasedate;
        res.price = !isNaN(crawledIssue.price) && crawledIssue.price !== '' ? crawledIssue.price : '0';
        res.currency = crawledIssue.currency ? crawledIssue.currency.trim() : '';
        res = await res.save({transaction: transaction});

        await models.Issue_Individual.destroy({where: {fk_issue: res.id}, transaction});

        await asyncForEach(crawledIssue.individuals, async individual => {
            if (individual.name && individual.name.trim() !== '') {
                await res.associateIndividual(individual.name.trim(), individual.type, transaction);
                await res.save({transaction: transaction});
            }
        });

        let cover = await models.Cover.findOne({where: {fk_issue: res.id, number: 0}, transaction});

        if (!cover) {
            cover = await models.Cover.create({
                url: crawledIssue.cover.url,
                number: 0,
                addinfo: ''
            }, {transaction: transaction});

            cover.setIssue(res, {transaction: transaction});
        } else {
            cover.url = crawledIssue.cover.url;
        }

        cover = await cover.save({transaction: transaction});
        await models.Cover_Individual.destroy({where: {fk_cover: cover.id}, transaction});

        await asyncForEach(crawledIssue.cover.individuals ? crawledIssue.cover.individuals : [], async (artist) => {
            await cover.associateIndividual(artist.name.trim(), 'ARTIST', transaction);
            await cover.save({transaction: transaction});
        });

        await models.Issue_Arc.destroy({where: {fk_issue: res.id}, transaction});

        await asyncForEach(crawledIssue.arcs, async arc => {
            if (arc.title && arc.title.trim() !== '')
                await res.associateArc(arc.title.trim(), arc.type, transaction);
        });

        await res.save({transaction: transaction});

        let stories = await models.Story.findAll({
            where: {fk_issue: res.id},
            order: [['number', 'ASC']],
            transaction
        });

        if (crawledIssue.stories && stories.length === crawledIssue.stories.length) {
            await asyncForEach(stories, async (story, i) => {
                story.name = crawledIssue.name;
                await story.save({transaction: transaction});

                await models.Story_Individual.destroy({where: {fk_story: story.id}, transaction});

                await asyncForEach(crawledIssue.stories[i].individuals, async (individual) => {
                    await story.associateIndividual(individual.name.trim(), individual.type, transaction);
                });

                await models.Story_Appearance.destroy({where: {fk_story: story.id}, transaction});

                await asyncForEach(crawledIssue.stories[i].appearances, async appearance => {
                    if (appearance.name && appearance.name.trim() !== '')
                        await story.associateAppearance(appearance.name.trim(), appearance.type, appearance.role, transaction);
                });
            });
        }
    } catch (e) {
        throw e;
    }
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
                    if (afterFirstMigration) {
                        series = await models.Series.findOne({
                            where: {id: issue.fk_series}
                        });

                        if (!series)
                            return;

                        publisher = await models.Publisher.findOne({
                            where: {id: series.fk_publisher}
                        });

                        if (!publisher)
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

                    console.log("[" + (new Date()).toUTCString() + " ID#" + issue.id + "] Migrating issue " + issueToCreate.series.title + " (Vol." + issueToCreate.series.volume + ") " + issueToCreate.number + variant + " (" + (index + 1) + " of " + array.length + ")");

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

                        if (!parent)
                            throw Error('No parent found for story ' + story.number + " [ID#" + story.id + "]");

                        let parentIssue;
                        let parentIssues = await parent.getIssues();
                        await asyncForEach(parentIssues, async p => {
                            if (p.originalissue === 1)
                                parentIssue = p;
                        });

                        let parentSeries = await migration.Series.findOne({
                            where: {id: parentIssue.fk_series}
                        });

                        if (!parentIssue)
                            throw Error('No issue found for parent ' + parentSeries.title + " (Vol." + parentSeries.volume + ") [ID#" + parentIssue.id + "]");

                        if (parentIssue.number === '')
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

                    if (afterFirstMigration) {
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

                        if (res)
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

                if (!p)
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

                if (!s)
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