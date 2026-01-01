"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const boot_1 = require("../boot");
const util_1 = require("../util/util");
const models_1 = __importDefault(require("../models"));
var stream;
var input;
(0, boot_1.boot)(async () => {
    console.log('[' + new Date().toUTCString() + '] ? Creating translators');
    try {
        input = [];
        try {
            const inputStream = fs_1.default.readFileSync('uebersetzer.csv', 'utf-8');
            inputStream.split(/\r?\n/).forEach((line) => {
                input.push(line);
            });
        }
        catch (e) {
            console.log(e);
        }
        stream = fs_1.default.createWriteStream('log', { flags: 'a' });
        await createTranslators(input);
    }
    catch (e) {
        if (stream)
            stream.end();
    }
});
function writeLine(s) {
    stream.write(s + '\n');
}
async function createTranslators(input) {
    try {
        await (0, util_1.asyncForEach)(input, async (line) => {
            let issueId = line.split(';')[0];
            let translatorName = line.split(';')[1];
            let translator = await models_1.default.Individual.findOne({ where: { name: translatorName } });
            let stories = await models_1.default.Story.findAll({ where: { fk_issue: issueId } });
            stories.forEach((story) => {
                writeLine('INSERT INTO story_individual (fk_individual, fk_story, role, createdAt, updatedAt) VALUES (' +
                    translator.id +
                    ', ' +
                    story.id +
                    ", 'TRANSLATOR', now(), now());");
            });
        });
    }
    catch (e) {
        console.log(e);
    }
}
