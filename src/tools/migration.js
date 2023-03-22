import fs from "fs";
import models from "./models";
import {updateIssueTags} from "./models/Issue";
import {asyncForEach} from "./util/util";
import {boot} from "../boot";

var stream;

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Migrating database");

    try {
        stream = fs.createWriteStream("log", {flags: 'a'});

        await migrate();
    } catch (e) {
        if (stream)
            stream.end();
    }
})

function writeLine(s) {
    stream.write(s + "\n");
}

async function migrate() {
    try {
        let issues = await models.Issue.findAll({
            where: {
                '$Series->Publisher.original$': 0
            },
            include: [
                {
                    model: models.Series,
                    include: [
                        models.Publisher
                    ]
                }
            ]
        });

        await asyncForEach(issues, async (i, idx) => {
            let transaction = await models.sequelize.transaction();

            let series = await models.Series.findOne({where: {id: i.fk_series}, transaction});

            console.log("[" + (new Date()).toUTCString() + "] Migrating issue " + (idx + 1) + " of " + issues.length + " " +
                "(" + series.title + " (Vol. " + series.volume + ") #" + i.number + ")")

            await updateIssueTags(i, transaction);

            await transaction.commit();
        })

    } catch (e) {
        console.log(e);
    }
}

start();