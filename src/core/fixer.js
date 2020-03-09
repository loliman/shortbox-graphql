import models from "../models";
import {asyncForEach, generateMarvelDbIssueUrl, generateMarvelDbSeriesUrl} from "../util/util";
import * as fetch from "node-fetch";
import AbortController from "abort-controller";
import {crawlIssueHtml, crawlSeriesHtml} from "./crawler";
import Sequelize from "sequelize";
import stringSimilarity from "string-similarity";
import {httpAgent} from "../config/config";

export async function fix() {
    let series = await models.Series.findAll({
        attributes: ["id", "title", "volume", "startyear", "endyear", "fk_publisher"],
        where: {
            '$Publisher.original$': 1,
            title: "Free Comic Book Day",
            volume: 2016,
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

            let url = generateMarvelDbSeriesUrl(s);
            const controller = new AbortController();

            try {
                if (idx % 100 === 0 && idx !== 0) {
                    for (let x = 60; x > 0; x--) {
                        process.stdout.clearLine();
                        process.stdout.cursorTo(0);
                        process.stdout.write("Taking a nap for " + x + " seconds... " + Math.round((idx / a.length * 100) * 100) / 100 + "% (" + (idx + 1) + "/" + a.length + ")");
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write("Fetching " + url + "... " + Math.round((idx / a.length * 100) * 100) / 100 + "% (" + (idx + 1) + "/" + a.length + ")");

                let response = await fetch(url, {
                    agent: httpAgent,
                    timeout: 60000,
                    signal: controller.signal
                });

                if (response.status === 200) {
                    if (response.redirected) {
                        console.log("\n" + url + " redirected to " + response.url);
                    }

                    let crawledSeries = await crawlSeriesHtml(await response.text(), s);

                    controller.abort();

                    console.log(s);
                    console.log(crawledSeries);
                } else {
                    console.log("\n" + response.status + " while fetching " + url);

                    controller.abort();
                }

                resolve(true)
            } catch (e) {
                console.log("\n" + e + " while fetching " + url + " COUNT: " + idx);
                resolve(e);
            }
        });
    });

    let issues = await models.Issue.findAll({
        attributes: ['id', 'number', 'releasedate', 'fk_series'],
        where: {
            '$Series->Publisher.original$': 1,
            '$Series.title$': "Free Comic Book Day",
            '$Series.volume$': 2016,
            number: 'Avengers',
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

    await asyncForEach(issues, async (i, idx, a) => {
        return new Promise(async (resolve, reject) => {
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

            let url = generateMarvelDbIssueUrl(i);
            const controller = new AbortController();

            try {
                if(idx % 100 === 0 && idx !== 0) {
                    for(let x = 60; x > 0; x--) {
                        process.stdout.clearLine();
                        process.stdout.cursorTo(0);
                        process.stdout.write("Taking a nap for " + x + " seconds... " + Math.round((idx / a.length * 100) * 100) / 100 + "% (" + (idx+1) + "/" + a.length + ")");
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write("Fetching " + url + "... " + Math.round((idx / a.length * 100) * 100) / 100 + "% (" + (idx+1) + "/" + a.length + ")");

                let response = await fetch(url, {
                    agent: httpAgent,
                    timeout: 60000,
                    signal: controller.signal
                });

                if (response.status === 200) {
                    if(response.redirected) {
                       console.log("\n" + url + " redirected to " + response.url);
                    }

                    let crawledIssue = await crawlIssueHtml(await response.text(), i);

                    controller.abort();

                    //console.log(i);
                    //console.log(crawledIssue);

                    i.individuals.forEach(indi => {
                        crawledIssue.individuals.forEach(crawledIndi => {
                            console.log(indi.name + " compared to " + crawledIndi.name + " equals " + stringSimilarity.compareTwoStrings(indi.name, crawledIndi.name));
                        })
                    });
                } else {
                    console.log("\n" + response.status + " while fetching " + url);

                    controller.abort();
                }

                resolve(true);
            } catch (e) {
                if(e.name === "AbortError")
                    resolve(true);
                else {
                    console.log("\n" + e + " while fetching " + url + " COUNT: " + idx);
                    resolve(e);
                }
            }
        });
    });
}
