import {boot} from "../../boot";
import models from "./models";
import {asyncForEach} from "../../util/util";

var stream;

let idToCrawl = 567429;

boot(async () => {

    console.log("[" + (new Date()).toUTCString() + "] ? Crawling issue with id " + idToCrawl);

    try {
        await crawlComicsOrg(idToCrawl);
    } catch (e) {
        if (stream)
            stream.end();
    }
})

function writeLine(s) {
    stream.write(s + "\n");
}

async function crawlComicsOrg(idToCrawl) {
    try {
        let issue = await models.Issue.findOne({where: {id: idToCrawl}});

        let stories = (await models.Story.findAll({
            where: {issue_id: issue.id},
            order: [['sequence_number', 'DESC']],
        })).filter(s =>
            s.type_id === 13 || s.type_id === 19 || s.type_id === 21
        ).reverse();

        await asyncForEach(stories, async (story, i) => {
            console.log("| StoryTitle" + (i + 1) + " = " + (story.title && story.title != "" ? story.title : "Untitled"));

            let writer = story.scripts;
            let penciler = story.pencils;
            let inker = story.inks;
            let colorist = story.colors;
            let letterer = story.letters;

            let individuals = await models.Individual.findAll({
                include: [{
                    model: models.Story
                }, {
                    model: models.IndividualType
                }],
                where: {
                    '$Stories->Story_Individual.story_id$': story.id,
                    '$Stories->Story_Individual.credit_type_id$': 1
                }
            });

            if ((!writer || writer === "") && individuals.length > 0)
                writer = individuals[0].gcd_official_name;

            individuals = await models.Individual.findAll({
                include: [{
                    model: models.Story
                }, {
                    model: models.IndividualType
                }],
                where: {
                    '$Stories->Story_Individual.story_id$': story.id,
                    '$Stories->Story_Individual.credit_type_id$': 2
                }
            });

            if ((!penciler || penciler === "") && individuals.length > 0)
                penciler = individuals[0].gcd_official_name;

            individuals = await models.Individual.findAll({
                include: [{
                    model: models.Story
                }, {
                    model: models.IndividualType
                }],
                where: {
                    '$Stories->Story_Individual.story_id$': story.id,
                    '$Stories->Story_Individual.credit_type_id$': 3
                }
            });

            if ((!inker || inker === "") && individuals.length > 0)
                inker = individuals[0].gcd_official_name;

            individuals = await models.Individual.findAll({
                include: [{
                    model: models.Story
                }, {
                    model: models.IndividualType
                }],
                where: {
                    '$Stories->Story_Individual.story_id$': story.id,
                    '$Stories->Story_Individual.credit_type_id$': 4
                }
            });

            if ((!colorist || colorist === "") && individuals.length > 0)
                colorist = individuals[0].gcd_official_name;

            individuals = await models.Individual.findAll({
                include: [{
                    model: models.Story
                }, {
                    model: models.IndividualType
                }],
                where: {
                    '$Stories->Story_Individual.story_id$': story.id,
                    '$Stories->Story_Individual.credit_type_id$': 5
                }
            });

            if ((!letterer || letterer === "") && individuals.length > 0)
                letterer = individuals[0].gcd_official_name;

            console.log("| Writer" + (i + 1) + "_1 = " + (writer ? writer : ""));
            console.log("| Penciler" + (i + 1) + "_1 = " + (penciler ? penciler : ""));
            console.log("| Inker" + (i + 1) + "_1 = " + (inker ? inker : ""));
            console.log("| Colorist" + (i + 1) + "_1 = " + (colorist ? colorist : ""));
            console.log("| Letterer" + (i + 1) + "_1 = " + (letterer ? letterer : ""));

            console.log("| Synopsis" + (i + 1) + " = ");
            console.log("| Solicit =");

            console.log("\n")
            console.log("| Appearing" + (i + 1) + " = ");
            console.log("<!--'''Featured Characters:'''");
            console.log("* <br/>");
            console.log("'''Supporting Characters:'''");
            console.log("* <br/>");
            console.log("'''Antagonists:'''");
            console.log("* <br/>");
            console.log("'''Other Characters:'''");
            console.log("* <br/>");
            console.log("'''Locations:'''");
            console.log("* <br/>");
            console.log("'''Items:'''");
            console.log("* <br/>");
            console.log("'''Vehicles:'''");
            console.log("* <br/>-->");
            console.log("\n")
        });
    } catch (e) {
        console.log(e);
    }
}