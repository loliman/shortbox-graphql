"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const models_1 = __importDefault(require("./models"));
const Issue_1 = require("./models/Issue");
const util_1 = require("./util/util");
const boot_1 = require("../boot");
var stream;
(0, boot_1.boot)(async () => {
    console.log('[' + new Date().toUTCString() + '] 🚀 Migrating database');
    try {
        stream = fs_1.default.createWriteStream('log', { flags: 'a' });
        await migrate();
    }
    catch (e) {
        if (stream)
            stream.end();
    }
});
function writeLine(s) {
    stream.write(s + '\n');
}
async function migrate() {
    try {
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
        await (0, util_1.asyncForEach)(issues, async (i, idx) => {
            let transaction = await models_1.default.sequelize.transaction();
            let series = await models_1.default.Series.findOne({ where: { id: i.fk_series }, transaction });
            console.log('[' +
                new Date().toUTCString() +
                '] Migrating issue ' +
                (idx + 1) +
                ' of ' +
                issues.length +
                ' ' +
                '(' +
                series.title +
                ' (Vol. ' +
                series.volume +
                ') #' +
                i.number +
                ')');
            await (0, Issue_1.updateIssueTags)(i, transaction);
            await transaction.commit();
        });
    }
    catch (e) {
        console.log(e);
    }
}
start();
