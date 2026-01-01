"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const boot_1 = require("../boot");
const util_1 = require("../util/util");
const models_1 = __importDefault(require("../models"));
(0, boot_1.boot)(async () => {
    console.log('[' + new Date().toUTCString() + '] 🚀 Finding variants with stories...');
    await findVariantsWithStories();
});
async function findVariantsWithStories(input) {
    let issues = await models_1.default.Issue.findAll({
        where: {
            '$Series->Publisher.original$': 0,
        },
        group: [['fk_series'], ['number']],
        order: [
            ['fk_series', 'DESC'],
            ['number', 'ASC'],
        ],
        include: [
            {
                model: models_1.default.Series,
                include: [models_1.default.Publisher],
            },
        ],
    });
    await (0, util_1.asyncForEach)(issues, async (issue) => {
        let variants = await models_1.default.Issue.findAll({
            where: {
                number: issue.number,
                fk_series: issue.fk_series,
            },
            order: [
                ['fk_series', 'DESC'],
                ['number', 'ASC'],
            ],
        });
        if (variants.length > 1) {
            let countVariantsWithStories = [];
            await (0, util_1.asyncForEach)(variants, async (variant) => {
                let stories = await models_1.default.Story.findAll({
                    where: {
                        fk_issue: variant.id,
                    },
                });
                if (stories.length > 0) {
                    variant.storycount = stories.length;
                    countVariantsWithStories.push(variant);
                }
            });
            if (countVariantsWithStories.length > 1) {
                let series = await models_1.default.Series.findOne({
                    where: {
                        id: issue.fk_series,
                    },
                });
                let publisher = await models_1.default.Publisher.findOne({
                    where: {
                        id: series.fk_publisher,
                    },
                });
                await (0, util_1.asyncForEach)(countVariantsWithStories, async (variant, i) => {
                    console.log('[' +
                        new Date().toUTCString() +
                        '] ' +
                        series.title +
                        (series.startyear ? ' (' + series.startyear : '') +
                        (series.enydear ? ' - ' + series.endyear : '') +
                        (series.startyear ? ')' : '') +
                        ' #' +
                        variant.number +
                        ' ' +
                        variant.format +
                        '/' +
                        variant.variant +
                        ' (' +
                        publisher.name +
                        ')' +
                        ' STORYCOUNT: ' +
                        variant.storycount);
                    if (i !== 0) {
                        await models_1.default.Story.destroy({
                            where: {
                                fk_issue: variant.id,
                            },
                        });
                    }
                });
            }
        }
    });
}
