import fs from "fs";
import {exit} from "shelljs";
import {boot} from "../boot";
import models from "../models";
import {asyncForEach, romanize} from "../util/util";

var stream;

boot(async () => {
    console.log("[" + (new Date()).toUTCString() + "] 🚀 Listing comics");

    try {
        let input = [];

        try {
            const inputStream = fs.readFileSync('ls_import', 'utf-8');
            inputStream.split(/\r?\n/).forEach(line => {
                input.push(line)
            });
        } catch (e) {
        }

        stream = fs.createWriteStream("comics.log", {flags: 'a'});

        await asyncForEach(input,
            async line => await ls(line)
        );
    } catch (e) {
        if (stream)
            stream.end();
    } finally {
        exit();
    }
})

function writeLine(s) {
    stream.write(s + "\n");
}

async function ls(line) {
    if (line.trim() === "" || line.split(";").length !== 3)
        return;

    console.log(line);

    let issues = await models.Issue.findAll({
            where: {
                number: line.split(";")[2],
                '$Series->Publisher.original$': 0,
                '$Series.title$': line.split(";")[0],
                '$Series.volume$': line.split(";")[1],
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

    await asyncForEach(issues, async issue => {
        let variants = await models.Issue.findAll({
            where: {
                number: issue.number,
                fk_series: issue.fk_series,
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

        let parent = null;
        let v = [];
        let stories = [];

        if (variants.length === 1) {
            parent = variants[0];

            stories = await models.Story.findAll({
                where: {fk_issue: parent.id},
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
                comicguideid: parent.comicguideid
            })
        } else {
            await asyncForEach(variants, async variant => {
                if (parent == null) {
                    stories = await models.Story.findAll({
                        where: {fk_issue: variant.id},
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
                    comicguideid: variant.comicguideid
                })
            })
        }

        let series = await models.Series.findOne({
            where: {id: issue.fk_series}
        });

        let publisher = await models.Publisher.findOne({
            where: {id: series.fk_publisher}
        });

        let title = series.title + " (" + series.startyear + ") #" + parent.number + " [" + publisher.name + "]";

        writeLine(title);
        if (parent.title !== "")
            writeLine("Titel: " + parent.title);

        writeLine("");

        let indi = [];

        if (stories.length > 0) {
            writeLine("Originalausgaben: ");

            await asyncForEach(stories, async s => {
                let individuals = await models.Individual.findAll({
                    include: [{
                        model: models.Story
                    }],
                    where: {
                        '$Stories->Story_Individual.fk_story$': s.id
                    },
                    raw: true
                });

                await asyncForEach(individuals, async i => {
                    let role = await models.Story_Individual.findAll({
                        where: {
                            'fk_individual': i.id,
                            'fk_story': s.id
                        },
                        raw: true
                    });

                    role.forEach(r => {
                        indi.push({name: i.name, role: r.type})
                    })
                });

                let parentStory = await models.Story.findOne({
                    where: {id: s.fk_parent},
                });

                individuals = await models.Individual.findAll({
                    include: [{
                        model: models.Story
                    }],
                    where: {
                        '$Stories->Story_Individual.fk_story$': parentStory.id
                    },
                    raw: true
                });

                await asyncForEach(individuals, async i => {
                    let role = await models.Story_Individual.findAll({
                        where: {
                            'fk_individual': i.id,
                            'fk_story': parentStory.id
                        },
                        raw: true
                    });

                    role.forEach(r => {
                        indi.push({name: i.name, role: r.type})
                    })
                });

                let parentIssue = await models.Issue.findOne({
                    where: {id: parentStory.fk_issue},
                });

                let parentSeries = await models.Series.findOne({
                    where: {id: parentIssue.fk_series},
                });

                writeLine("" + parentSeries.title + " (" + parentSeries.startyear + ") #" + parentIssue.number + " [" + romanize(parentStory.number) + "]");
            })
        }

        writeLine("");

        if (indi.length > 0) {
            let artists = [...new Set(indi.filter(i => i.role === "PENCILER").map(i => i.name))]
            writeLine("Zeichner: " + artists.join(", "))

            let writers = [...new Set(indi.filter(i => i.role === "WRITER").map(i => i.name))]
            writeLine("Texter: " + writers.join(", "))

            let translators = [...new Set(indi.filter(i => i.role === "TRANSLATOR").map(i => i.name))]

            if (translators && translators.length > 0) {
                writeLine("Übersetzung: " + translators.join(", "));
            }
        }

        writeLine("");
        writeLine("Varianten:");

        await asyncForEach(v, async v => {
            writeLine("" + v.format + (v.variant && v.variant !== "" ? " Variante " + v.variant : " "));
            writeLine("" + "Seiten: " + v.pages)
            writeLine("" + "Erscheinungsdatum: " + v.releasedate.toLocaleDateString("de-DE"));
            writeLine("" + "Ursprüngl. Coverpreis: " + v.price + "€")
            if (v.isbn && v.isbn > 0)
                writeLine("" + "ISBN: " + v.isbn + "")
            writeLine("" + "Herkunftsland: USA")

            if (v.limitation && v.limitation > 0)
                writeLine("" + "Limitierte Ausgabe (" + v.limitation + " Exemplare)");

            let indi = [];
            let cover = await models.Cover.findOne({where: {fk_issue: v.id}});

            if (cover) {
                let parentCover = await models.Cover.findOne({
                    where: {id: cover.fk_parent},
                });

                if (!parentCover) {
                    writeLine("Cover exklusiv für diese Ausgabe");

                    let individuals = await models.Individual.findAll({
                        include: [{
                            model: models.Cover
                        }],
                        where: {
                            '$Covers->Cover_Individual.fk_cover$': cover.id
                        },
                        raw: true
                    });

                    await asyncForEach(individuals, async i => {
                        let role = await models.Cover_Individual.findAll({
                            where: {
                                'fk_individual': i.id,
                                'fk_cover': parentCover.id
                            },
                            raw: true
                        });

                        role.forEach(r => {
                            indi.push({name: i.name, role: r.type})
                        })
                    });

                    if (indi.length > 0) {
                        let artists = [...new Set(indi.filter(i => i.role === "ARTIST").map(i => i.name))]
                        writeLine("Cover von " + artists.join(", "))
                    }
                } else {
                    let parentIssue = await models.Issue.findOne({
                        where: {id: parentCover.fk_issue},
                    });

                    let parentSeries = await models.Series.findOne({
                        where: {id: parentIssue.fk_series},
                    });

                    let individuals = await models.Individual.findAll({
                        include: [{
                            model: models.Cover
                        }],
                        where: {
                            '$Covers->Cover_Individual.fk_cover$': parentCover.id
                        },
                        raw: true
                    });

                    await asyncForEach(individuals, async i => {
                        let role = await models.Cover_Individual.findAll({
                            where: {
                                'fk_individual': i.id,
                                'fk_cover': parentCover.id
                            },
                            raw: true
                        });

                        role.forEach(r => {
                            indi.push({name: i.name, role: r.type})
                        })
                    });

                    if (indi.length > 0) {
                        let artists = [...new Set(indi.filter(i => i.role === "ARTIST").map(i => i.name))]
                        writeLine("Cover von " + artists.join(", ") + " (" + parentSeries.title + " (" + parentSeries.startyear + ") #" + parentIssue.number + ")")
                    } else {
                        writeLine("Cover aus " + parentSeries.title + " (" + parentSeries.startyear + ") #" + parentIssue.number);
                    }
                }
            }

            writeLine("" + "Comicguide ID: " + (v.comicguideid ? v.comicguideid : "n/a"));
            writeLine("");
        });

        writeLine("");
        writeLine("-------------------------------------------------------");
        writeLine("");
    })
}