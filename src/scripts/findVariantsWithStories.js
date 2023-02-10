import {boot} from "../boot";
import {asyncForEach} from "../util/util";
import models from "../models";

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Finding variants with stories...");

    await findVariantsWithStories();
})

async function findVariantsWithStories(input) {
    let issues = await models.Issue.findAll({
            where: {
                '$Series->Publisher.original$': 0,
            },
            group: [['fk_series'], ['number']],
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
        })
    ;

    await asyncForEach(issues, async (issue) => {
        let variants = await models.Issue.findAll({
            where: {
                'number': issue.number,
                'fk_series': issue.fk_series
            },
            order: [['fk_series', 'DESC'], ['number', 'ASC']]
        });

        if (variants.length > 1) {
            let countVariantsWithStories = [];

            await asyncForEach(variants, async (variant) => {
                let stories = await models.Story.findAll({
                    where: {
                        'fk_issue': variant.id
                    }
                });

                if (stories.length > 0) {
                    variant.storycount = stories.length;
                    countVariantsWithStories.push(variant);
                }
            });

            if (countVariantsWithStories.length > 1) {
                let series = await models.Series.findOne({
                    where: {
                        'id': issue.fk_series
                    }
                });

                let publisher = await models.Publisher.findOne({
                    where: {
                        'id': series.fk_publisher
                    }
                });

                await asyncForEach(countVariantsWithStories, async (variant, i) => {
                    console.log("[" + (new Date()).toUTCString() + "] "
                        + series.title
                        + (series.startyear ? " (" + series.startyear : "")
                        + (series.enydear ? " - " + series.endyear : "")
                        + (series.startyear ? ")" : "")
                        + " #" + variant.number + " " + variant.format + "/" + variant.variant + " (" + publisher.name + ")" + " STORYCOUNT: " + variant.storycount);

                    if (i !== 0) {
                        await models.Story.destroy({
                            where: {
                                'fk_issue': variant.id
                            }
                        });
                    }
                });
            }
        }
    });
}
