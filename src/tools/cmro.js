import {boot} from "../boot";
import cheerio from "cheerio";
import fs from "fs";
import {asyncForEach} from "../util/util";
import models from "../models";
import {exit} from "shelljs";
import Sequelize from "sequelize";

let BASE_URL = "/Users/christian/Downloads/cmro.travis-starnes.com/character_details.php-character=814";
var stream;

boot(async () => {
    try {
        console.log("[" + (new Date()).toUTCString() + "] ? Crawling reading order " + BASE_URL);

        stream = fs.createWriteStream("reading_order", {flags: 'a'});

        await crawlReadingOrder();
    } catch (e) {
        if (stream)
            stream.end();
    } finally {
        exit();
    }
});

function writeLine(s) {
    stream.write(s + "\n");
}

async function crawlReadingOrder() {
    try {
        let $ = cheerio.load(fs.readFileSync(BASE_URL + "&page=1.html"));
        let pagination = $(".pagination");
        let buttons = pagination.get(0).children;
        let lastPage = parseInt(buttons[buttons.length - 2].children[0].data);

        let stories = [];

        for (let i = 1; i <= lastPage; i++) {
            $ = cheerio.load(fs.readFileSync(BASE_URL + "&page=" + i + ".html"));
            stories = stories.concat($(".list_detail_body").get());
        }

        stories = stories.map(row => {
            let line = replaceStory(row.children[9].children[1].children[0].attribs.title);
            console.log("Parsing: " + line);

            let title = line.split("(")[0].trim();

            if (title.startsWith("The"))
                title = title.substring(3).trim();

            let year = parseInt(splitLastOccurrence(line, "(")[1].split(")")[0]);

            let number = 1;
            if (line.split("#").length > 1) {
                number = line.split("#")[1].split("[")[0].trim();
            }

            let story = 1;
            if (line.split("[").length > 1) {
                story = alphabet.indexOf(line.split("[")[1].split("]")[0].trim().toUpperCase()) + 1;
            }

            return {
                line: line,
                number: story,
                issue: {number: number, series: {title: title, startyear: year}}
            };
        });

        let notFound = 0;
        await asyncForEach(stories, async (story) => {
            console.log("Searching for: " + story.issue.series.title.replace(/[^a-z0-9]/gi, '%').trim() + " (" + story.issue.series.startyear + ") #" + story.issue.number + " [" + story.line + "]");

            let where = {
                number: story.issue.number,
                variant: '',
                '$Series->Publisher.original$': 1,
                '$Series.title$': {[Sequelize.Op.like]: story.issue.series.title.replace(/[^a-z0-9]/gi, '%').trim()}
            };

            if (!isNaN(story.issue.series.startyear)) {
                where['$Series.startyear$'] = story.issue.series.startyear;
            }

            let issues = await models.Issue.findAll({
                where: where,
                order: [['fk_series', 'DESC'], ['number', 'ASC']],
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

            if (issues.length === 0) {
                writeLine(story.issue.series.title + " (" + story.issue.series.startyear + ") #" + story.issue.number + " not found.");
                notFound++;
            } else {
                let stories = await issues[0].getStories();

                if (!stories[story.number - 1]) {
                    writeLine(story.issue.series.title + " (" + story.issue.series.startyear + ") #" + story.issue.number + " not found.");
                    notFound++;
                    return;
                }

                let children = await models.Story.findAll({where: {fk_parent: stories[story.number - 1].id}});

                let germanIssues = [];
                await asyncForEach(children, async child => germanIssues.push(await child.getIssue()));

                writeLine(story.issue.series.title + " (" + story.issue.series.startyear + ") #" + story.issue.number + " found in: ");

                await asyncForEach(germanIssues, async issue => {
                    let series = await issue.getSeries();
                    let publisher = await series.getPublisher();

                    writeLine("\t" + series.title + " (Vol. " + series.volume + ") #" + issue.number + " [" + publisher.name + "]");
                });
            }
        });

        writeLine("\n" + notFound + " issues not found!")
    } catch (e) {
        writeLine(e);
    }
}

const alphabet = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
];

function replaceStory(title) {
    let res = title;
    res = title.replaceAll(" Story", "");

    return res;
}

function splitLastOccurrence(str, substring) {
    const lastIndex = str.lastIndexOf(substring);
    const before = str.slice(0, lastIndex);
    const after = str.slice(lastIndex + 1);
    return [before, after];
}