import models from "../models";
import {asyncForEach, generateMarvelDbIssueUrl, generateMarvelDbSeriesUrl} from "../util/util";
import {Crawler} from "./crawler";
import Sequelize from "sequelize";
import stringSimilarity from "string-similarity";
import {Logger} from "./logger";

const crawler = new Crawler();

export async function fix() {
    let series = await models.Series.findAll({
        attributes: ["id", "title", "volume", "startyear", "endyear", "fk_publisher"],
        where: {
            '$Publisher.original$': 1,
            title: "Amazing Spider-Man Annual",
            volume: 1,
        },
        raw: true,
        include: [
            {
                attributes: [],
                model: models.Publisher,
                raw: true
            }
        ],
    });

    await asyncForEach(series, async (s, idx, a) => {
        return new Promise(async (resolve, reject) => {
            s.publisher = await models.Publisher.findOne({
                attributes: ["id", "name"],
                where: {id: s.fk_publisher},
                raw: true
            });

            try {
                Logger.log("Fetching " + generateMarvelDbSeriesUrl(s) + "... " + Math.round((idx / a.length * 100) * 100) / 100 + "% (" + (idx + 1) + "/" + a.length + ")", "fixer");

                let {response, cached, crawledSeries} = await crawler.crawlSeries(s);

                if(cached)
                    resolve(true);

                if (response.status === 200) {
                    if (response.redirected) {
                        console.log("\n" + url + " redirected to " + response.url);
                    }
                } else if(response.status !== 304) {
                    console.log("\n" + response.status + " while fetching " + generateMarvelDbSeriesUrl(s));
                }

                resolve(true)
            } catch (e) {
                console.log("\n" + e + " while fetching " + generateMarvelDbSeriesUrl(s) + " COUNT: " + idx);
                resolve(e);
            }
        });
    });

    let issues = await models.Issue.findAll({
        attributes: ['id', 'number', 'releasedate', 'fk_series'],
        where: {
            '$Series->Publisher.original$': 1,
            variant: ''
        },
        include: [
            {
                attributes: [],
                model: models.Series,
                raw: true,
                include: [
                    {
                        attributes: [],
                        model: models.Publisher,
                        raw: true
                    }
                ]
            }
        ],
        raw: true
    });

    await asyncForEach(issues, async (issue, idx, a) => {
        return new Promise(async (resolve, reject) => {
            let i = Object.assign({}, issue);

            i.series = await models.Series.findOne({
                attributes: ["id", "title", "volume", "startyear", "endyear", "fk_publisher"],
                where: {id: i.fk_series},
                raw: true
            });

            i.series.publisher = await models.Publisher.findOne({
                attributes: ["id", "name"],
                where: {id: i.series.fk_publisher},
                raw: true
            });

            i.individuals = await models.Individual.findAll({
                attributes: ["id", "name"],
                include: [{
                    attributes: [],
                    model: models.Issue,
                    raw: true
                }],
                where: {
                    '$Issues->Issue_Individual.fk_issue$': i.id
                },
                raw: true
            });

            i.stories = await models.Story.findAll({
                attributes: ["id", "title", "number"],
                where: {fk_issue: i.id},
                raw: true
            });

            await asyncForEach(i.stories, async (s, sidx) => {
                i.stories[sidx].appearing = await models.Appearance.findAll({
                    attributes: ["id", "name"],
                    include: [{
                        attributes: [],
                        model: models.Story,
                        raw: true
                    }],
                    where: {
                        '$Stories->Story_Appearance.fk_story$': s.id
                    },
                    raw: true
                })
            });

            await asyncForEach(i.stories, async (s) => {
                s.individuals = await models.Individual.findAll({
                    attributes: ["id", "name"],
                    include: [{
                        attributes: [],
                        model: models.Story,
                        raw: true
                    }],
                    where: {
                        '$Stories->Story_Individual.fk_story$': s.id
                    },
                    raw: true
                })
            });

            i.cover = await models.Cover.findAll({
                attributes: ["id", "url"],
                where: {fk_issue: i.id},
                raw: true
            });

            i.cover[0].individuals = await models.Individual.findAll({
                attributes: ["id", "name"],
                include: [{
                    attributes: [],
                    model: models.Cover,
                    raw: true
                }],
                where: {
                    '$Covers->Cover_Individual.fk_cover$': i.cover[0].id
                },
                raw: true
            });

            i.arcs = await models.Arc.findAll({
                attributes: ["id", "title", "type"],
                where: {
                    '$Issues->Issue_Arc.fk_issue$': i.id
                },
                include: [{
                    attributes: [],
                    model: models.Issue,
                    raw: true
                }],
                raw: true
            });

            i.variants = await models.Issue.findAll({
                attributes: ["id", "variant"],
                where: {
                    number: i.number,
                    fk_series: i.fk_series,
                    variant: {[Sequelize.Op.ne]: ''}
                },
                raw: true
            });

            await asyncForEach(i.variants, async (v) => {
                v.individuals = await models.Individual.findAll({
                    attributes: ["id", "name"],
                    include: [{
                        attributes: [],
                        model: models.Cover,
                        raw: true
                    }],
                    where: {
                        '$Covers->Cover_Individual.fk_cover$': v.id
                    },
                    raw: true
                })
            });

            if(!i.series)
                resolve(true);

            try {
                Logger.log("Fetching " + generateMarvelDbIssueUrl(i) + "... " + Math.round((idx / a.length * 100) * 100) / 100 + "% (" + (idx+1) + "/" + a.length + ")", "fixer");

                let {response, cached, crawledIssue} = await crawler.crawlIssue(i);

                if(cached)
                    resolve(true);

                if (response.status === 200) {
                    if(response.redirected) {
                       console.log("\n" + generateMarvelDbIssueUrl(i) + " redirected to " + response.url);
                    }

                    //console.log(i);
                    //console.log(crawledIssue);

                    await handleReprints(crawledIssue);

                    /*i.individuals.forEach(indi => {
                       crawledIssue.individuals.forEach(crawledIndi => {
                           console.log(indi.name + " compared to " + crawledIndi.name + " equals " + stringSimilarity.compareTwoStrings(indi.name, crawledIndi.name));
                       })
                    });*/
                } else if(response.status !== 304) {
                    console.log("\n" + response.status + " while fetching " + generateMarvelDbIssueUrl(i));
                }

                resolve(true);
            } catch (e) {
                console.log("\n" + e + " while fetching " + generateMarvelDbIssueUrl(i) + " COUNT: " + idx);
                resolve(e);
            }
        });
    });
}

async function handleReprints(issue) {
    return new Promise(async (resolve, reject) => {
        try {
            await getReprintedIssues(issue);
            await getReprintIssues(issue);
            resolve(issue);
        } catch (e) {
            reject(e);
        }
    });
}

async function getReprintedIssues(issue) {
    await asyncForEach(issue.stories, async (story) => {
        if(!story.reprintOf)
            return;

        let {cached, crawledIssue} = await crawler.crawlIssue(story.reprintOf);

        if(!cached)
            await handleReprints(crawledIssue);
    });
}

async function getReprintIssues(issue) {
    if(!issue.reprintedIn)
        return;

    await asyncForEach(issue.reprintedIn, async (reprintedIn) => {
        let {cached, crawledIssue} = await crawler.crawlIssue(reprintedIn);

        if(!cached)
            await handleReprints(crawledIssue);
    });
}