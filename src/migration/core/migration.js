import migration from "../models";
import models from "../../models";
import {asyncForEach} from "../../util/util";
import fs from 'fs';
import {create} from "../../models/Issue";

var stream;

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
    stream.write("Migrating issues...");
    return new Promise(async (resolve, reject) => {
        try {
            let issues = await migration.Issue.findAll({
                where: {'$Series.original$': 0},
                include: [migration.Series]
            });

            await asyncForEach(issues, async issue => {
                let issueToCreate = {};
                issueToCreate.title = issue.title;
                issueToCreate.number = issue.number;
                issueToCreate.format = issue.format;
                issueToCreate.variant = issue.variant;
                issueToCreate.pages = issue.pages;
                issueToCreate.releasedate = issue.releasedate;
                issueToCreate.price = issue.price;
                issueToCreate.currency = issue.currency;

                let series = await migration.Series.findOne({
                    where: {id: issue.fk_series}
                });

                let publisher = await migration.Publisher.findOne({
                    where: {id: series.fk_publisher}
                });

                issueToCreate.series = {
                    title: series.title,
                    volume: series.volume,
                    publisher: {
                        name: publisher.name
                    }
                };

                issueToCreate.stories = [];
                let stories = await migration.Story.findAll({
                    include: [{
                        model: models.Issue
                    }],
                    where: {
                        '$Issues->Issue_Story.fk_issue$': issue.id
                    }
                });

                await asyncForEach(stories, async story => {
                    let parent = await migration.Story.findOne({
                        include: [{
                            model: models.Issue
                        }],
                        where: {
                            fk_story: story.id,
                            '$Issues->Issue_Story.originalissue': 1
                        }
                    });

                    let issue = await migration.Issue.findOne({
                        where: {
                            id: parent.fk_issue
                        }
                    });

                    let series = await migration.Series.findOne({
                        where: {id: issue.fk_series}
                    });

                    issueToCreate.stories.push({
                        number: issueToCreate.stories.length + 1,
                        addinfo: story.additionalInfo,
                        parent: {
                            number: parent.number,
                            issue: {
                                number: issue.number,
                                series: {
                                    title: series.title,
                                    volume: series.volume
                                }
                            }
                        }
                    });
                });

                //Now lets create the issue itself
                let transaction;
                try {
                    let variant = issue.format || issue.variant ? " [" : "";
                    if (issue.format)
                        variant += issue.format;

                    if (variant !== "" && issue.variant)
                        variant += "/";

                    if (issue.variant)
                        variant += issue.variant;

                    if (variant !== "")
                        variant += "]";


                    stream.write("Migrating " + issue.series.name + " Vol." + issue.series.volume + " #" + issue.number + variant);

                    transaction = await migration.sequelize.transaction();
                    await create(issueToCreate, transaction);
                    transaction.commit();
                    stream.write("Migrating " + issue.series.name + " Vol." + issue.series.volume + " #" + issue.number + variant + " successful");
                } catch (e) {
                    if (transaction)
                        transaction.rollback();

                    stream.write("Migrating " + issue.series.name + " Vol." + issue.series.volume + " #" + issue.number + variant + " unsuccessful");
                }
            });

            stream.write("Migrating issues successful");
            resolve(true);
        } catch (e) {
            stream.write("Migrating issues unsuccessful");
            reject(e);
        }
    });
}

async function migratePublishers() {
    stream.write("Migrating publishers...");
    return new Promise(async (resolve, reject) => {
        let transaction = await migration.sequelize.transaction();

        try {
            let publishers = await migration.Publisher.findAll({
                where: {'$Series.original$': 0},
                include: [migration.Series],
                transaction
            });

            await asyncForEach(publishers, async publisher => {
                stream.write("Migrating " + publisher.name);

                await models.Publisher.create({
                    id: publisher.id,
                    name: publisher.name,
                    original: false
                }, {transaction: transaction});
            });

            transaction.commit();
            stream.write("Migrating publishers successful");
            resolve(true);
        } catch (e) {
            transaction.rollback();
            stream.write("Migrating publishers unsuccessful");
            reject(e);
        }
    });
}

async function migrateSeries() {
    stream.write("Migrating series...");
    return new Promise(async (resolve, reject) => {
        let transaction = await migration.sequelize.transaction();

        try {
            let series = await migration.Series.findAll({
                where: {original: 0},
                transaction
            });

            await asyncForEach(series, async series => {
                stream.write("Migrating " + series.title);

                await models.Series.create({
                    id: series.id,
                    title: series.title,
                    startyear: series.startyear,
                    endyear: series.endyear,
                    volume: series.volume
                }, {transaction: transaction});
            });

            transaction.commit();
            stream.write("Migrating series successful");
            resolve(true);
        } catch (e) {
            transaction.rollback();
            stream.write("Migrating series unsuccessful");
            reject(e);
        }
    });
}