import sequelize from './core/database'
import fs from "fs";
import {asyncForEach} from "./util/util";
import models from "./models";

var stream;
var input;

async function start() {
    await sequelize.authenticate();
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Database is up and running");

    await sequelize.sync();

    //remove that nasty constraints...
    try {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 Removing constraints from Database...");

        await sequelize.queryInterface.removeConstraint('cover_individual', 'cover_individual_fk_individual_fk_cover_unique');
        await sequelize.queryInterface.removeConstraint('feature_individual', 'feature_individual_fk_individual_fk_feature_unique');
        await sequelize.queryInterface.removeConstraint('issue_individual', 'issue_individual_fk_issue_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('story_individual', 'story_individual_fk_story_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('story_appearance', 'story_appearance_fk_story_fk_appearance_unique');

        await sequelize.queryInterface.removeConstraint('Cover_Individual', 'Cover_Individual_fk_individual_fk_cover_unique');
        await sequelize.queryInterface.removeConstraint('Feature_Individual', 'Feature_Individual_fk_individual_fk_feature_unique');
        await sequelize.queryInterface.removeConstraint('Issue_Individual', 'Issue_Individual_fk_issue_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('Story_Individual', 'Story_Individual_fk_story_fk_individual_unique');
        await sequelize.queryInterface.removeConstraint('Story_Appearance', 'Story_Appearance_fk_story_fk_appearance_unique');
    } catch (e) {
        //might be gone already, that's fine!
    } finally {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");
    }

    try {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 Creating stored procedures...");

        let sql = await fs.readFileSync('./functions.sql');
        await sequelize.query(sql.toString());
    } catch (e) {
        //might already exist
    } finally {
        console.log("[" + (new Date()).toUTCString() + "] 🚀 ... Done!");
    }

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Database is all set up");

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Importing collection");

    try {
        input = [];

        try {
            const inputStream = fs.readFileSync('sammlung.txt', 'latin1');
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

    console.log("[" + (new Date()).toUTCString() + "] 🚀 Done.");
}

function writeLine(s) {
    stream.write(s + "\n");
}

async function importCollection(input) {
    try {
        let issue;

        await asyncForEach(input, async (line) => {
            if(line.trim().length === 0) {
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

                if(number.trim().length === 0) {
                    number = "1";
                }

                issue.number = number;
            } else {
                issue = {
                    series: {
                        publisher: issue.series.publisher
                    }
                };

                if(line.indexOf(")") > 0) {
                    let years = line.substring(line.lastIndexOf("("));
                    let yearsExtracted = years.replace(/\D/g,'');

                    if(yearsExtracted.length === 4) {
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
                '$Series.title$': issue.series.title,
                number: issue.number
            };

            if(issue.series.startyear)
                filter['$Series.startyear$'] = issue.series.startyear;

            if(issue.series.endyear)
                filter['$Series.endyear$'] = issue.series.endyear;

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

            if(issues.length > 1) {
                /*writeLine("[" + (new Date()).toUTCString() + "] ERROR NOT UNIQUE "
                            + issue.series.title
                            + (issue.series.startyear ? " (" + issue.series.startyear : "")
                            + (issue.series.enydear ? " - " + issue.series.endyear : "")
                            + (issue.series.startyear ? ")" : "")
                            + " #" + issue.number + " (" + issue.series.publisher.name + ")");*/
            } else if(issues.length === 0) {
                writeLine("[" + (new Date()).toUTCString() + "] ERROR NOT FOUND "
                            + issue.series.title
                            + (issue.series.startyear ? " (" + issue.series.startyear : "")
                            + (issue.series.enydear ? " - " + issue.series.endyear : "")
                            + (issue.series.startyear ? ")" : "")
                            + " #" + issue.number + " (" + issue.series.publisher.name + ")");
            }
        })
    } catch (e) {
        console.log(e);
    }
}

start();