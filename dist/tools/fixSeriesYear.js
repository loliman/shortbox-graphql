"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const boot_1 = require("../boot");
const models_1 = __importDefault(require("../models"));
const util_1 = require("../util/util");
(0, boot_1.boot)(async () => {
    console.log('[' + new Date().toUTCString() + '] ? Fixing start and endyears of german series...');
    await fixSeriesYear();
});
async function fixSeriesYear() {
    let series = await models_1.default.Series.findAll({
        where: {
            '$Publisher.original$': 0,
        },
        include: [
            {
                model: models_1.default.Publisher,
            },
        ],
    });
    await (0, util_1.asyncForEach)(series, async (series, i, a) => {
        let firstYear = await models_1.default.Issue.findOne({
            attributes: [
                [models_1.default.sequelize.fn('MIN', models_1.default.sequelize.col('Issue.releasedate')), 'releasedate'],
            ],
            where: {
                fk_series: series.id,
            },
            include: [
                {
                    model: models_1.default.Series,
                    include: [models_1.default.Publisher],
                },
            ],
        });
        if (firstYear.releasedate !== null) {
            firstYear = firstYear.releasedate.getFullYear();
        }
        let endYear = await models_1.default.Issue.findOne({
            attributes: [
                [models_1.default.sequelize.fn('MAX', models_1.default.sequelize.col('Issue.releasedate')), 'releasedate'],
            ],
            where: {
                fk_series: series.id,
            },
            include: [
                {
                    model: models_1.default.Series,
                    include: [models_1.default.Publisher],
                },
            ],
        });
        if (endYear.releasedate !== null) {
            endYear = endYear.releasedate.getFullYear();
            if (endYear >= new Date().getFullYear() - 1)
                endYear = 0;
        }
        if (firstYear !== null && endYear !== null) {
            console.log('[' + i + '/' + a.length + '] Fixing ' + series.title + ' (Vol. ' + series.volume + ')');
            await models_1.default.User.update({ startyear: firstYear, endyear: endYear }, { where: { id: series.id } });
        }
    });
}
