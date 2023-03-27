import {exit} from "shelljs";
import {boot} from "../boot";
import models from "../models";
import {asyncForEach} from "../util/util";
import {updateIssueTags} from "../models/Issue";

var stream;

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Listing comics");

    try {
        await updateTags()
    } catch (e) {
        if (stream)
            stream.end();
    } finally {
        exit();
    }
})

function writeLine(s) {
    console.log(s);
}

async function updateTags(line) {
    let issues = await models.Issue.findAll({
            where: {
                '$Series->Publisher.original$': 0
            },
            include:
                [
                    {
                        model: models.Series,
                        include: [
                            models.Publisher
                        ]
                    }
                ]
        })
    ;

    await asyncForEach(issues, async (issue, i, a) => {
        let series = await issue.getSeries();
        let publisher = await series.getPublisher();

        writeLine("[" + i + "/" + a.length + "] Updating tags of issue " + series.title + " (Vol. " + series.volume + ") #" + issue.number + " [" + publisher.name + "]");
        await updateIssueTags(issue);
    })
}
