import fs from "fs";
import {boot} from "../boot";
import {asyncForEach} from "../util/util";
import models from "../models";

var stream;
var input;

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] ? Creating translators");

    try {
        input = [];

        try {
            const inputStream = fs.readFileSync('uebersetzer.csv', 'utf-8');
            inputStream.split(/\r?\n/).forEach(line => {
                input.push(line)
            });
        } catch (e) {
            console.log(e);
        }

        stream = fs.createWriteStream("log", {flags: 'a'});

        await createTranslators(input);
    } catch (e) {
        if (stream)
            stream.end();
    }
})

function writeLine(s) {
    stream.write(s + "\n");
}

async function createTranslators(input) {
    try {

        await asyncForEach(input, async (line) => {
            let issueId = line.split(";")[0];
            let translatorName = line.split(";")[1];

            let translator = await models.Individual.findOne({where: {name: translatorName}});
            let stories = await models.Story.findAll({where: {fk_issue: issueId}});

            stories.forEach(story => {
                writeLine("INSERT INTO story_individual (fk_individual, fk_story, role, createdAt, updatedAt) VALUES (" + translator.id + ", " + story.id + ", 'TRANSLATOR', now(), now());")
            })
        })
    } catch (e) {
        console.log(e);
    }
}