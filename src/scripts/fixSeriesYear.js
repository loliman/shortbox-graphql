import {boot} from "../boot";
import models from "../models";
import {asyncForEach} from "../util/util";

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] ? Fixing start and endyears of german series...");

    await fixSeriesYear();
})

async function fixSeriesYear() {
    let series = await models.Series.findAll({
            where: {
                '$Publisher.original$': 0,
            },
            include:
                [
                    {
                        model: models.Publisher
                    }
                ]
        })
    ;

    await asyncForEach(series, async (series, i, a) => {
        let firstYear = await models.Issue.findOne({
            attributes: [[models.sequelize.fn('MIN', models.sequelize.col('Issue.releasedate')), 'releasedate']],
            where: {
                fk_series: series.id,
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

        if (firstYear.releasedate !== null) {
            firstYear = firstYear.releasedate.getFullYear();
        }

        let endYear = await models.Issue.findOne({
            attributes: [[models.sequelize.fn('MAX', models.sequelize.col('Issue.releasedate')), 'releasedate']],
            where: {
                fk_series: series.id,
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

        if (endYear.releasedate !== null) {
            endYear = endYear.releasedate.getFullYear();

            if (endYear >= (new Date()).getFullYear() - 1)
                endYear = 0;
        }

        if (firstYear !== null && endYear !== null) {
            console.log("[" + i + "/" + a.length + "] Fixing " + series.title + " (Vol. " + series.volume + ")")

            await models.User.update(
                {startyear: firstYear, endyear: endYear},
                {where: {id: series.id}}
            )
        }
    });
}