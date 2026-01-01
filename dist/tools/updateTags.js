"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const shelljs_1 = require("shelljs");
const boot_1 = require("../boot");
const models_1 = __importDefault(require("../models"));
const util_1 = require("../util/util");
const Issue_1 = require("../models/Issue");
var stream;
(0, boot_1.boot)(async () => {
    console.log('[' + new Date().toUTCString() + '] 🚀 Listing comics');
    try {
        await updateTags();
    }
    catch (e) {
        if (stream)
            stream.end();
    }
    finally {
        (0, shelljs_1.exit)();
    }
});
function writeLine(s) {
    console.log(s);
}
async function updateTags(line) {
    let issues = await models_1.default.Issue.findAll({
        where: {
            '$Series->Publisher.original$': 0,
        },
        include: [
            {
                model: models_1.default.Series,
                include: [models_1.default.Publisher],
            },
        ],
    });
    await (0, util_1.asyncForEach)(issues, async (issue, i, a) => {
        let series = await issue.getSeries();
        let publisher = await series.getPublisher();
        writeLine('[' +
            i +
            '/' +
            a.length +
            '] Updating tags of issue ' +
            series.title +
            ' (Vol. ' +
            series.volume +
            ') #' +
            issue.number +
            ' [' +
            publisher.name +
            ']');
        await (0, Issue_1.updateIssueTags)(issue);
    });
}
