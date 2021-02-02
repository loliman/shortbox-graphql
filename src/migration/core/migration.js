import models from '../../models';
import migration from '../../migration/models';

import {asyncForEach} from "../../util/util";
import fs from 'fs';
import {crawl, generateIssueUrl, generateIssueName} from "../../core/crawler";
import {create as createIssue} from "../../models/Issue";
import {create as createSeries} from "../../models/Series";
import {create as createPublisher} from "../../models/Publisher";
import {update} from "../../util/FilterUpdater";

const cliProgress = require('cli-progress');
const multibar = new cliProgress.MultiBar({
    format: '[{name}] [{bar}] {percentage}% | {filename} | {eta}s | {value}/{total}',
    clearOnComplete: false,
    hideCursor: true
}, cliProgress.Presets.shades_grey);

let current;
let overall;
export let notfound;
let noparent;
let insert;
let storyBar;

export var storyLog;
export var usLog;
export var germanLog;
export var noParentLog;
export var notFoundLog;

export async function migrate() {
    return new Promise(async (resolve, reject) => {
        initLogs();

        try {
            let oldIssues = await getAllGermanIssuesFromMigration();
            initBars(oldIssues.length);

            await asyncForEach(oldIssues, async (oldIssue, oldIssuesIndex) => {
                let transaction;

                try {
                    transaction = await models.sequelize.transaction();
                    let oldIssueStories = await oldIssue.getStories();
                    oldIssue = await issueDtoToObject(oldIssue);

                    updateBar(current, "DE", oldIssue, oldIssuesIndex+1);

                    let allStoriesInDb = true;
                    await asyncForEach(oldIssueStories, async (oldIssueStory, oldIssueStoriesIdx) => {
                        let oldStoryParent = await oldIssueStory.getParent();

                        if(!oldStoryParent) {
                            if (allStoriesInDb) {
                                oldIssue.stories.push({
                                    exclusive: true,
                                    number: oldIssueStory.number,
                                    title: oldIssueStory.title,
                                    addinfo: oldIssueStory.addinfo
                                });
                                return;

                            } else {
                                printError("NP", oldIssue, oldIssue, "Story " + (idx + 1) + " seems to be exclusive", noParentLog);
                                updateBar(noparent, "NP", oldIssue, noparent.getTotal() + 1, noparent.getTotal() + 1);
                                return;
                            }
                        }

                        let oldStoryParentIssue = await oldStoryParent.getIssue();
                        let oldStoryParentIssueStories = await oldStoryParentIssue.getStories();
                        let oldStoryParentIssueStoriesLength = oldStoryParentIssueStories.length;
                        oldStoryParentIssue = await oldIssueToNewIssue(oldStoryParentIssue);
                        updateBar(overall, "US", oldStoryParentIssue, oldIssueStoriesIdx+1, oldIssueStories.length);

                        let newUsIssue = await models.Issue.findOne({
                            where: {
                                '$Series->Publisher.original$': oldStoryParentIssue.series.publisher.original,
                                '$Series.title$':  oldStoryParentIssue.series.title.trim(),
                                '$Series.volume$': oldStoryParentIssue.series.volume,
                                'number': oldStoryParentIssue.number
                            },
                            group: ['fk_series', 'number'],
                            include: [
                                {
                                    model: migration.Series,
                                    include: [
                                        migration.Publisher
                                    ]
                                }
                            ],
                            transaction: transaction
                        });

                        if(!newUsIssue) { //US Issue does not exist in new database!
                            let crawledIssue = await crawl(oldStoryParentIssue);

                            if(!crawledIssue) {
                                crawledIssue = oldStoryParentIssue;
                                crawledIssue.edited = true;

                                if(crawledIssue.variants)
                                    crawledIssue.variants.forEach(v => {
                                        v.edited = true;
                                    });
                            }
                            //console.log(util.inspect(ci, false, null, true));

                            if(crawledIssue.stories.length !== oldStoryParentIssueStoriesLength) {
                                crawledIssue = oldStoryParentIssue;

                                if(crawledIssue.variants)
                                    crawledIssue.variants.forEach(v => {
                                        v.edited = true;
                                    });

                                if(!crawledIssue) {
                                    allStoriesInDb = false;
                                    printError("ST", oldIssue, crawledIssue, "Stories do differ! "
                                        + (crawledIssue.stories.length > oldStoryParentIssueStoriesLength.length ? "crawled" : "current")
                                        + " has more stories. " +
                                        "(Current: " + oldStoryParentIssueStoriesLength + ", Crawled: " + crawledIssue.stories.length + ")", storyLog);
                                    updateBar(storyBar, "ST", crawledIssue, storyBar.getTotal()+1, storyBar.getTotal()+1);

                                    throw new Error();
                                }
                            }

                            newUsIssue = await create(crawledIssue, transaction);

                            if(!newUsIssue) {
                                allStoriesInDb = false;
                                printError("US", oldIssue, crawledIssue, "Could not create issue", usLog);
                                updateBar(insert, "IS", crawledIssue, insert.getTotal()+1, insert.getTotal()+1);

                                throw new Error();
                            }
                        } else {
                            newUsIssue = await issueDtoToObject(newUsIssue, transaction);
                        }

                        if(allStoriesInDb) {
                            //create Story in oldIssue
                            oldIssue.stories.push({
                                number: oldIssueStory.number,
                                addinfo: oldIssueStory.addinfo,
                                parent: {
                                    number: oldStoryParent.number,
                                    issue: newUsIssue
                                }
                            });
                        }
                    });

                    if(allStoriesInDb) {
                        oldIssue.edited = true;
                        if(oldIssue.variants)
                            oldIssue.variants.forEach(v => {
                                v.edited = true;
                            });

                        let result = await create(oldIssue, transaction);
                        if(!result) {
                            printError("DE", oldIssue, oldIssue, "Could not create issue", germanLog);
                            throw new Error();
                        }
                    }

                    await transaction.commit();
                } catch (e) {
                    if(transaction)
                        await transaction.rollback();

                    console.log(e);
                    throw e;
                }
            });

            resolve(true);
        } catch (e) {
            console.log(e);
            resolve(false);
        } finally {
            multibar.stop();
            closeLogs();
        }
    });
}

export function printError(type, issue, oIssue, e, stream) {
    stream.write(/*TCString() + "] " + "[" + type + "] " + */generateIssueName(issue) + " | " + generateIssueUrl(oIssue) + ": " + e + "\n");
}

async function getAllGermanIssuesFromMigration() {
    return new Promise(async (resolve, reject) => {
        let res = await migration.Issue.findAll({
            where: {
                '$Series->Publisher.original$': 0/*,
        '$Series.title$': "Die Marvel-Superhelden-Sammlung",
        '$Series.volume$': 1,
        'number': '61'*/
            },
            include: [
                {
                    model: migration.Series,
                    include: [
                        migration.Publisher
                    ]
                }
            ]
        });

        resolve(res);
    })
}

async function create(issue, transaction) {
    return new Promise(async (resolve, reject) => {
        let result;

        let publisher = await models.Publisher.findOne({
            where: {
                name: issue.series.publisher.name,
                original: issue.series.publisher.original
            },
            transaction: transaction
        });

        if (!publisher) {
            try {
                publisher = await createPublisher(issue.series.publisher, transaction);
            } catch (e) {
                return null;
            }
        }

        let series = await models.Series.findOne({
            where: {
                title: issue.series.title,
                volume: issue.series.volume,
                fk_publisher: publisher.id
            },
            transaction: transaction
        });

        if (!series) {
            try {
                series = await createSeries(issue.series, transaction);
            } catch (e) {
                return null;
            }
        }

        result = await models.Issue.findOne({
            where: {
                number: issue.number,
                format: issue.format,
                variant: issue.variant,
                fk_series: series.id
            },
            transaction: transaction
        });

        if (!result) {
            try {
                result = await createIssue(issue, transaction);

                if (issue.variants)
                    await asyncForEach(issue.variants, async v => {
                        try {
                            await createIssue(v, transaction);
                        } catch (e) {
                            return null;
                        }
                    });
            } catch (e) {
                return null;
            }
        }

        let res = await issueDtoToObject(result, transaction);

        if(!publisher.original) {
            await update(result, transaction);
        }

        resolve(res);
    });
}

function initBars(issues) {
    current = multibar.create(issues, 0);
    overall = multibar.create(0, 0);
    insert = multibar.create(0, 0);
    insert.increment();
    insert.update(0, {name: "IN", filename: "N/A"});
    storyBar = multibar.create(0, 0);
    storyBar.increment();
    storyBar.update(0, {name: "ST", filename: "N/A"});
    noparent = multibar.create(0, 0);
    noparent.increment();
    noparent.update(0, {name: "NP", filename: "N/A"});
    notfound = multibar.create(0, 0);
    notfound.increment();
    notfound.update(0, {name: "NF", filename: "N/A"});
}

function initLogs() {
    storyLog = fs.createWriteStream("logs/stories.log", {flags: 'a'});
    germanLog = fs.createWriteStream("logs/german.log", {flags: 'a'});
    usLog = fs.createWriteStream("logs/us.log", {flags: 'a'});
    noParentLog = fs.createWriteStream("logs/noParent.log", {flags: 'a'});
    notFoundLog = fs.createWriteStream("logs/notFound.log", {flags: 'a'});
}

function closeLogs() {
    if (storyLog)
        storyLog.end();
    if (usLog)
        usLog.end();
    if (germanLog)
        germanLog.end();
    if (noParentLog)
        noParentLog.end();
    if (notFoundLog)
        notFoundLog.end();
}

function updateBar(bar, name, issue, current, total) {
    bar.increment();
    bar.update(current, {name: name, filename: generateIssueUrl(issue)});
    if(total)
        bar.setTotal(total);
}

async function issueDtoToObject(issue, transaction) {
    return new Promise(async (resolve, reject) => {
        let series = await issue.getSeries({transaction: transaction});
        let publisher = await series.getPublisher({transaction: transaction});

        resolve({
            number: issue.number,
            title: issue.title,
            format: issue.format,
            limitation: issue.limitation,
            variant: issue.variant,
            releasedate: issue.releasedate,
            pages: issue.pages,
            price: issue.price,
            currency: issue.currency,
            addinfo: issue.addinfo,
            series: {
                title: series.title,
                volume: series.volume,
                addinfo: series.addinfo,
                startyear: series.startyear,
                endyear: series.endyear,
                genre: series.genre,
                publisher: {
                    name: publisher.name,
                    original: publisher.original,
                    addinfo: publisher.addinfo,
                    startyear: publisher.startyear,
                    endyear: publisher.endyear
                }
            },
            stories: []
        });
    });
}

async function oldIssueToNewIssue(oldIssue) {
    return new Promise(async (resolve, reject) => {
        let result = await issueDtoToObject(oldIssue);
        result.individuals = [];
        result.stories = [];

        let covers = await oldIssue.getCovers();
        if(covers.length > 0) {
            result.cover = {url: covers[0].url};
        }

        let oldStories = await oldIssue.getStories();
        await asyncForEach(oldStories, async (oldStory) => {
            let story = {
                exclusive: oldStory.exclusive,
                number: oldStory.number,
                title: oldStory.title,
                addinfo: oldStory.addinfo,
                individuals: []
            };

            let oldIndividuals = await oldStory.getIndividuals();
            await asyncForEach(oldIndividuals, async (oldIndividual) => {
                let contains = story.individuals.find(i => i.name.toLowerCase() === oldIndividual.name.toLowerCase());
                let type = oldIndividual.dataValues.Story_Individual.dataValues.type;

                if (contains) {
                    if (!contains.type.includes(type))
                        contains.type.push(type);
                } else {
                    story.individuals.push({
                        name: oldIndividual.name,
                        type: [type]
                    })
                }
            });

            result.stories.push(story);
        });

        let oldIndividuals = await oldIssue.getIndividuals();
        await asyncForEach(oldIndividuals, async (oldIndividual) => {
            let contains = result.individuals.find(i => i.name.toLowerCase() === oldIndividual.name.toLowerCase());
            let type = oldIndividual.dataValues.Issue_Individual.dataValues.type;

            if (contains) {
                if (!contains.type.includes(type))
                    contains.type.push(type);
            } else {
                result.individuals.push({
                    name: oldIndividual.name,
                    type: [type]
                })
            }
        });

        resolve(result);
    });
}