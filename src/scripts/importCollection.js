import fs from "fs";
import {asyncForEach} from "./util/util";
import models from "./models";
import Sequelize from "sequelize";
import {boot} from "../boot";

var stream;
var input;

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Importing collection");

    try {
        input = [];

        try {
            const inputStream = fs.readFileSync('sammlung.txt', 'utf-8');
            inputStream.split(/\r?\n/).forEach(line => {
                input.push(line)
            });
        } catch (e) {
            console.log(e);
        }

        stream = fs.createWriteStream("log", {flags: 'a'});

        await importCollection(input);
    } catch (e) {
        if (stream)
            stream.end();
    }
})

function writeLine(s) {
    stream.write(s + "\n");
}

async function importCollection(input) {
    try {
        let issue;

        await asyncForEach(input, async (line) => {
            if (line.trim().length === 0) {
                return;
            } else if (!line.startsWith(" ")) {
                issue = {
                    series: {
                        publisher: {
                            name: line.trim(),
                            original: 0
                        }
                    }
                };
                return;
            } else if (line.startsWith("  ")) {
                let number = line.substring(0, line.indexOf(".")).trim().replaceAll("(", "").replaceAll(")", "");

                if (number.trim().length === 0) {
                    number = "1";
                }

                issue.number = number;
            } else {
                issue = {
                    series: {
                        publisher: issue.series.publisher
                    }
                };

                if (line.indexOf(")") > 0 && !line.trim().startsWith("Spider-Man Komplett")) {
                    let years = line.substring(line.lastIndexOf("("));
                    let yearsExtracted = years.replace(/\D/g, '');

                    if (yearsExtracted.length === 4) {
                        issue.series.startyear = yearsExtracted;
                        line = line.replace(years, "");
                    } else if (yearsExtracted.length === 8) {
                        issue.series.startyear = yearsExtracted.substring(0, 4);
                        issue.series.endyear = yearsExtracted.substring(4, 8);
                        line = line.replace(years, "");
                    }
                }

                issue.series.title = line.trim();
                return;
            }

            let filter = {
                '$Series->Publisher.original$': 0,
                '$Series->Publisher.name$': issue.series.publisher.name,
                '$Series.title$': {[Sequelize.Op.like]: '%' + issue.series.title.replace(/[\W_]+/g, " ").replace(/\s/g, '%') + '%'},
                number: issue.number
            };

            if (issue.series.startyear)
                filter['$Series.startyear$'] = issue.series.startyear;

            //if (issue.series.endyear)
            //    filter['$Series.endyear$'] = issue.series.endyear;

            let issues = await models.Issue.findAll({
                where: filter,
                include:
                    [
                        {
                            model: models.Series,
                            include: [
                                models.Publisher
                            ]
                        }
                    ]
            });

            if (issues.length > 1) {
                let defaultIssue = issues.filter(i => (i.format === "Softcover" || i.format === "Heft" || i.format === "Album" || i.format === "Taschenbuch" || i.format === "Magazin") && i.variant === '');

                if (defaultIssue.length === 0) {
                    defaultIssue = issues.filter(i => i.variant.toLowerCase().indexOf('kiosk') > -1 || i.variant === '');
                }

                if (defaultIssue.length === 0) {
                    writeLine("[" + (new Date()).toUTCString() + "] ERROR NO DEFAULT "
                        + issue.series.title
                        + (issue.series.startyear ? " (" + issue.series.startyear : "")
                        + (issue.series.enydear ? " - " + issue.series.endyear : "")
                        + (issue.series.startyear ? ")" : "")
                        + " #" + issue.number + " (" + issue.series.publisher.name + ")");
                } else {
                    /*writeLine("[" + (new Date()).toUTCString() + "] WARNING CHECK VARIANT "
                        + issue.series.title
                        + (issue.series.startyear ? " (" + issue.series.startyear : "")
                        + (issue.series.enydear ? " - " + issue.series.endyear : "")
                        + (issue.series.startyear ? ")" : "")
                        + " #" + issue.number + " (" + issue.series.publisher.name + ")");
                    defaultIssue[0].collected = true;
                    await defaultIssue[0].save();*/
                }
            } else if (issues.length === 0) {
                writeLine("[" + (new Date()).toUTCString() + "] ERROR NOT FOUND "
                    + issue.series.title
                    + (issue.series.startyear ? " (" + issue.series.startyear : "")
                    + (issue.series.enydear ? " - " + issue.series.endyear : "")
                    + (issue.series.startyear ? ")" : "")
                    + " #" + issue.number + " (" + issue.series.publisher.name + ")");
            } else {
                issues[0].collected = true;
                await issues[0].save();
            }
        })
    } catch (e) {
        console.log(e);
    }
}