"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const shelljs_1 = require("shelljs");
const boot_1 = require("../boot");
const models_1 = __importDefault(require("../models"));
const util_1 = require("../util/util");
var stream;
(0, boot_1.boot)(async () => {
    console.log('[' + new Date().toUTCString() + '] 🚀 Listing comics');
    try {
        let input = [];
        try {
            const inputStream = fs_1.default.readFileSync('ls_import', 'utf-8');
            inputStream.split(/\r?\n/).forEach((line) => {
                input.push(line);
            });
        }
        catch (e) { }
        stream = fs_1.default.createWriteStream('comics.log', { flags: 'a' });
        await (0, util_1.asyncForEach)(input, async (line) => await ls(line));
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
    stream.write(s + '\n');
}
async function ls(line) {
    if (line.trim() === '' || line.split(';').length !== 3)
        return;
    console.log(line);
    let issues = await models_1.default.Issue.findAll({
        where: {
            number: line.split(';')[2],
            '$Series->Publisher.original$': 0,
            '$Series.title$': line.split(';')[0],
            '$Series.volume$': line.split(';')[1],
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
            include: [
                {
                    model: models_1.default.Series,
                    include: [models_1.default.Publisher],
                },
            ],
        });
        let parent = null;
        let v = [];
        let stories = [];
        if (variants.length === 1) {
            parent = variants[0];
            stories = await models_1.default.Story.findAll({
                where: { fk_issue: parent.id },
            });
            v.push({
                id: parent.id,
                format: parent.format,
                variant: parent.variant,
                releasedate: parent.releasedate,
                price: parent.price,
                isbn: parent.isbn,
                pages: parent.pages,
                limitation: parent.limitation,
                comicguideid: parent.comicguideid,
            });
        }
        else {
            await (0, util_1.asyncForEach)(variants, async (variant) => {
                if (parent == null) {
                    stories = await models_1.default.Story.findAll({
                        where: { fk_issue: variant.id },
                    });
                    if (stories.length > 0) {
                        parent = variant;
                    }
                }
                v.push({
                    id: variant.id,
                    format: variant.format,
                    variant: variant.variant,
                    releasedate: variant.releasedate,
                    price: variant.price,
                    pages: variant.pages,
                    isbn: variant.isbn,
                    limitation: variant.limitation,
                    comicguideid: variant.comicguideid,
                });
            });
        }
        let series = await models_1.default.Series.findOne({
            where: { id: issue.fk_series },
        });
        let publisher = await models_1.default.Publisher.findOne({
            where: { id: series.fk_publisher },
        });
        let title = series.title + ' (' + series.startyear + ') #' + parent.number + ' [' + publisher.name + ']';
        writeLine(title);
        if (parent.title !== '')
            writeLine('Titel: ' + parent.title);
        writeLine('');
        let indi = [];
        if (stories.length > 0) {
            writeLine('Originalausgaben: ');
            await (0, util_1.asyncForEach)(stories, async (s) => {
                let individuals = await models_1.default.Individual.findAll({
                    include: [
                        {
                            model: models_1.default.Story,
                        },
                    ],
                    where: {
                        '$Stories->Story_Individual.fk_story$': s.id,
                    },
                    raw: true,
                });
                await (0, util_1.asyncForEach)(individuals, async (i) => {
                    let role = await models_1.default.Story_Individual.findAll({
                        where: {
                            fk_individual: i.id,
                            fk_story: s.id,
                        },
                        raw: true,
                    });
                    role.forEach((r) => {
                        indi.push({ name: i.name, role: r.type });
                    });
                });
                let parentStory = await models_1.default.Story.findOne({
                    where: { id: s.fk_parent },
                });
                individuals = await models_1.default.Individual.findAll({
                    include: [
                        {
                            model: models_1.default.Story,
                        },
                    ],
                    where: {
                        '$Stories->Story_Individual.fk_story$': parentStory.id,
                    },
                    raw: true,
                });
                await (0, util_1.asyncForEach)(individuals, async (i) => {
                    let role = await models_1.default.Story_Individual.findAll({
                        where: {
                            fk_individual: i.id,
                            fk_story: parentStory.id,
                        },
                        raw: true,
                    });
                    role.forEach((r) => {
                        indi.push({ name: i.name, role: r.type });
                    });
                });
                let parentIssue = await models_1.default.Issue.findOne({
                    where: { id: parentStory.fk_issue },
                });
                let parentSeries = await models_1.default.Series.findOne({
                    where: { id: parentIssue.fk_series },
                });
                writeLine('' +
                    parentSeries.title +
                    ' (' +
                    parentSeries.startyear +
                    ') #' +
                    parentIssue.number +
                    ' [' +
                    (0, util_1.romanize)(parentStory.number) +
                    ']');
            });
        }
        writeLine('');
        if (indi.length > 0) {
            let artists = [...new Set(indi.filter((i) => i.role === 'PENCILER').map((i) => i.name))];
            writeLine('Zeichner: ' + artists.join(', '));
            let writers = [...new Set(indi.filter((i) => i.role === 'WRITER').map((i) => i.name))];
            writeLine('Texter: ' + writers.join(', '));
            let translators = [
                ...new Set(indi.filter((i) => i.role === 'TRANSLATOR').map((i) => i.name)),
            ];
            if (translators && translators.length > 0) {
                writeLine('Übersetzung: ' + translators.join(', '));
            }
        }
        writeLine('');
        writeLine('Varianten:');
        await (0, util_1.asyncForEach)(v, async (v) => {
            writeLine('' + v.format + (v.variant && v.variant !== '' ? ' Variante ' + v.variant : ' '));
            writeLine('' + 'Seiten: ' + v.pages);
            writeLine('' + 'Erscheinungsdatum: ' + v.releasedate.toLocaleDateString('de-DE'));
            writeLine('' + 'Ursprüngl. Coverpreis: ' + v.price + '€');
            if (v.isbn && v.isbn > 0)
                writeLine('' + 'ISBN: ' + v.isbn + '');
            writeLine('' + 'Herkunftsland: USA');
            if (v.limitation && v.limitation > 0)
                writeLine('' + 'Limitierte Ausgabe (' + v.limitation + ' Exemplare)');
            let indi = [];
            let cover = await models_1.default.Cover.findOne({ where: { fk_issue: v.id } });
            if (cover) {
                let parentCover = await models_1.default.Cover.findOne({
                    where: { id: cover.fk_parent },
                });
                if (!parentCover) {
                    writeLine('Cover exklusiv für diese Ausgabe');
                    let individuals = await models_1.default.Individual.findAll({
                        include: [
                            {
                                model: models_1.default.Cover,
                            },
                        ],
                        where: {
                            '$Covers->Cover_Individual.fk_cover$': cover.id,
                        },
                        raw: true,
                    });
                    await (0, util_1.asyncForEach)(individuals, async (i) => {
                        let role = await models_1.default.Cover_Individual.findAll({
                            where: {
                                fk_individual: i.id,
                                fk_cover: parentCover.id,
                            },
                            raw: true,
                        });
                        role.forEach((r) => {
                            indi.push({ name: i.name, role: r.type });
                        });
                    });
                    if (indi.length > 0) {
                        let artists = [...new Set(indi.filter((i) => i.role === 'ARTIST').map((i) => i.name))];
                        writeLine('Cover von ' + artists.join(', '));
                    }
                }
                else {
                    let parentIssue = await models_1.default.Issue.findOne({
                        where: { id: parentCover.fk_issue },
                    });
                    let parentSeries = await models_1.default.Series.findOne({
                        where: { id: parentIssue.fk_series },
                    });
                    let individuals = await models_1.default.Individual.findAll({
                        include: [
                            {
                                model: models_1.default.Cover,
                            },
                        ],
                        where: {
                            '$Covers->Cover_Individual.fk_cover$': parentCover.id,
                        },
                        raw: true,
                    });
                    await (0, util_1.asyncForEach)(individuals, async (i) => {
                        let role = await models_1.default.Cover_Individual.findAll({
                            where: {
                                fk_individual: i.id,
                                fk_cover: parentCover.id,
                            },
                            raw: true,
                        });
                        role.forEach((r) => {
                            indi.push({ name: i.name, role: r.type });
                        });
                    });
                    if (indi.length > 0) {
                        let artists = [...new Set(indi.filter((i) => i.role === 'ARTIST').map((i) => i.name))];
                        writeLine('Cover von ' +
                            artists.join(', ') +
                            ' (' +
                            parentSeries.title +
                            ' (' +
                            parentSeries.startyear +
                            ') #' +
                            parentIssue.number +
                            ')');
                    }
                    else {
                        writeLine('Cover aus ' +
                            parentSeries.title +
                            ' (' +
                            parentSeries.startyear +
                            ') #' +
                            parentIssue.number);
                    }
                }
            }
            writeLine('' + 'Comicguide ID: ' + (v.comicguideid ? v.comicguideid : 'n/a'));
            writeLine('');
        });
        writeLine('');
        writeLine('-------------------------------------------------------');
        writeLine('');
    });
}
