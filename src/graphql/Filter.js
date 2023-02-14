import {gql} from 'apollo-server';
import models from "../models";
import {asyncForEach, escapeSqlString, generateLabel, naturalCompare} from "../util/util";

var dateFormat = require('dateformat');

export const typeDef = gql`
 input DateFilter {
    date: Date,
    compare: String
  }
  
  input NumberFilter {
    number: String,
    compare: String,
    variant: String
  }
  
  input Filter {
    us: Boolean!,
    formats: [String],
    withVariants: Boolean,
    releasedates: [DateFilter],
    publishers: [PublisherInput],
    series: [SeriesInput],
    numbers: [NumberFilter],
    arcs: String,
    individuals: [IndividualInput],
    appearances: String,
    firstPrint: Boolean,
    onlyPrint: Boolean,
    onlyTb: Boolean,
    exclusive: Boolean,
    reprint: Boolean,
    otherOnlyTb: Boolean,
    noPrint: Boolean,
    onlyOnePrint: Boolean,
    onlyCollected: Boolean,
    onlyNotCollected: Boolean,
    sellable: Boolean
  }
  
  extend type Query {
    export(filter: Filter!, type: String!): String
  }
`;

export const resolvers = {
    Query: {
        export: async (_, {filter, type}, context) => {
            const {loggedIn, transaction} = context;

            let rawQuery = createFilterQuery(loggedIn, filter.us, filter, 0, true);
            let res = await models.sequelize.query(rawQuery);

            let response = {};
            //"publishername, seriestitle, seriesvolume, seriesstartyear, seriesendyear, issuenumber"
            await asyncForEach(res[0], async r => {
                let publisher = {
                    name: r.publishername
                };
                let series = {
                    title: r.seriestitle,
                    volume: r.seriesvolume,
                    startyear: r.seriesstartyear,
                    endyear: r.seriesendyear,
                    publisher: publisher
                };
                let issue = {
                    number: r.issuenumber,
                    format: r.issueformat,
                    variant: r.issuevariant,
                    pages: r.issuepages,
                    releasedate: r.issuereleasedate,
                    price: r.issueprice,
                    currency: r.issuecurrency,
                    series: series
                };

                let publisherLabel = await generateLabel(publisher);
                let seriesLabel = await generateLabel(series);

                if (publisherLabel in response) {
                    if (seriesLabel in response[publisherLabel])
                        response[publisherLabel][seriesLabel].push(issue);
                    else {
                        response[publisherLabel][seriesLabel] = [];
                        response[publisherLabel][seriesLabel].push(issue);
                    }
                } else {
                    response[publisherLabel] = {};
                    response[publisherLabel][seriesLabel] = [];
                    response[publisherLabel][seriesLabel].push(issue);
                }
            });

            let sortedResponse = Object.keys(response).map(key => {
                let p = response[key];
                return [key, Object.keys(p).map(key => {
                    let s = p[key];
                    return [key, Object.keys(s).map(key => {
                        let i = s[key];
                        return i;
                    }).sort((a, b) => naturalCompare(a.number, b.number))];
                }).sort()];
            }).sort();

            if (type === "txt") {
                return JSON.stringify(await convertFilterToTxt(filter) + await resultsToTxt(sortedResponse));
            } else if (type === "csv") {
                return JSON.stringify(await resultsToCsv(sortedResponse));
            } else {
                throw new Error("Gültige Export Typen: txt, csv");
            }
        }
    }
};

async function resultsToCsv(results) {
    let responseString = "Verlag;Series;Volume;Start;Ende;Nummer;Variante;Format;Seiten;Erscheinungsdaten;Preis;Währung\n";

    results.forEach(p => {
        p[1].forEach(s => {
            s[1].forEach(i => {
                responseString += i.series.publisher.name + "\t;"
                    + i.series.title + "\t;" + i.series.volume + "\t;" + i.series.startyear + "\t;" + i.series.endyear + "\t;"
                    + i.number + "\t;" + i.variant + "\t;" + i.format + "\t;" + i.pages + "\t;" + i.releasedate + "\t;" + (i.price + "").replace(".", ",") + "\t;" + i.currency + "\n";
            })
        });
    });

    return responseString;
}

async function resultsToTxt(results) {
    let responseString = "";

    results.forEach(p => {
        responseString += p[0] + "\n";
        p[1].forEach(s => {
            responseString += "\t" + s[0] + "\n";
            s[1].forEach(i => {
                responseString += "\t\t#" + i.number + "\n";
            })
        });
        responseString += "\n";
    });

    return responseString;
}

async function convertFilterToTxt(filter) {
    let s = "Aktive Filter\n";

    s += "\t" + (filter.us ? "Original Ausgaben" : "Deutsche Ausgaben") + "\n";

    s += "\tDetails\n";

    if (filter.formats) {
        s += "\t\tFormat: ";
        filter.formats.forEach(f => s += f + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.withVariants)
        s += "\t\tmit Varianten\n";

    if (filter.releasedates) {
        s += "\t\tErscheinungsdatum: ";
        filter.releasedates.forEach(r => s += dateFormat(new Date(r.date), "dd.mm.yyyy") + " " + r.compare + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (!filter.formats && !filter.withVariants && !filter.releasedates)
        s += "\t\t-\n";

    s += "\tEnthält\n";
    if (filter.firstPrint)
        s += "\t\tErstausgabe\n";
    if (filter.onlyPrint)
        s += "\t\tEinzige Ausgabe\n";
    if (filter.onlyTb)
        s += "\t\tNur in TB\n";
    if (filter.exclusive)
        s += "\t\tExclusiv\n";
    if (filter.reprint)
        s += "\t\tReiner Nachdruck\n";
    if (filter.otherOnlyTb)
        s += "\t\tNur in TB\n";
    if (filter.onlyOnePrint)
        s += "\t\tNur einfach auf deutsch erschienen\n";
    if (loggedIn && filter.onlyCollected)
        s += "\t\tIn Sammlung enthalten\n";
    if (loggedIn && filter.onlyNotCollected)
        s += "\t\tNicht in Sammlung enthalten\n";
    if (filter.noPrint)
        s += "\t\tNicht auf deutsch erschienen\n";

    if (filter.publishers) {
        s += "\t\tVerlag: ";
        filter.publishers.forEach(p => s += p.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.series) {
        s += "\t\tSerie: ";
        await asyncForEach(filter.series, async n => {
            s += await generateLabel(n) + ", ";
        });
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.numbers) {
        s += "\t\tNummer: ";
        filter.numbers.forEach(n => s += n.number + " " + n.compare + (n.variant !== '' ? " [" + n.variant + "]" : "") + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.arcs) {
        s += "\t\tTeil von: ";
        filter.arcs.forEach(n => {
            let type;
            switch (n.type) {
                case 'EVENT':
                    type = 'Event';
                    break;
                case 'STORYLINE':
                    type = 'Story Line';
                    break;
                default:
                    type = 'Story Arc';

            }
            s += n.title + " (" + type + ")" + ", "
        });
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (!filter.firstPrint && !filter.onlyPrint && !filter.onlyTb && !filter.exclusive && !filter.reprint && !filter.otherOnlyTb && !filter.noPrint && !filter.onlyOnePrint && (loggedIn && !filter.onlyCollected && !filter.onlyNotCollected))
        s += "\t\t-\n";

    s += "\tMitwirkende\n";

    if (filter.individuals && filter.individuals.filter(i => i.type === 'WRITER').length > 0) {
        s += "\t\tAutor: ";
        filter.individuals.filter(i => i.type === 'WRITER').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'PENCILER').length > 0) {
        s += "\t\tZeichner: ";
        filter.individuals.filter(i => i.type === 'PENCILER').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'ARTIST').length > 0) {
        s += "\t\tZeichner: ";
        filter.individuals.filter(i => i.type === 'ARTIST').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'INKER').length > 0) {
        s += "\t\tInker: ";
        filter.individuals.filter(i => i.type === 'INKER').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'COLOURIST').length > 0) {
        s += "\t\tKolorist: ";
        filter.individuals.filter(i => i.type === 'COLOURIST').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'LETTERER').length > 0) {
        s += "\t\tLetterer: ";
        filter.individuals.filter(i => i.type === 'LETTERER').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'EDITOR').length > 0) {
        s += "\t\tEditor: ";
        filter.individuals.filter(i => i.type === 'EDITOR').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.individuals && filter.individuals.filter(i => i.type === 'TRANSLATOR').length > 0) {
        s += "\t\tÜbersetzer: ";
        filter.individuals.filter(i => i.type === 'TRANSLATOR').forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (!filter.individuals)
        s += "\t\t-\n";

    s += "\tAuftritte\n";

    if (filter.appearances) {
        filter.appearances.forEach(i => s += "\t\t" + i.name.replace(new RegExp("\"", 'g'), '\'') + " (" + getType(i.type) + ")\n");
    }

    if (!filter.appearances)
        s += "\t\t-\n";

    return s + "\n\n";
}

function getType(type) {
    switch (type) {
        case "CHARACTER":
            return "Charakter";
        case "ITEM":
            return "Gegenstand";
        case "TEAM":
            return "Team";
        case "RACE":
            return "Rasse";
        case "ANIMAL":
            return "Tier";
        case "LOCATION":
            return "Ort";
        case "VEHICLE":
            return "Fahrzeug";
        default:
            return "";
    }
}

export function createFilterQuery(loggedIn, selected, filter, offset, print, overview, order, sort) {
    let type = "story";
    let us = filter.us ? 1 : 0;

    let columns = "p.name as publishername, p.id as publisherid, " +
        "s.title as seriestitle, s.volume as seriesvolume, s.startyear as seriesstartyear, s.endyear as seriesendyear, s.id as seriesid, " +
        "i.id as issueid, i.comicguideid as comicguideid, i.updatedAt as updatedAt, i.createdAt as createdAt, i.title as issuetitle, i.number as issuenumber, i.variant as issuevariant, i.id as issueid, i.format as issueformat, i.pages as issuepages, i.releasedate as issuereleasedate, i.price as issueprice, i.currency as issuecurrency, i.verified as issueverified, i.collected as issuecollected  ";

    let groupby = "";
    let where = "";

    if (print && !overview)
        groupby = "i.number, s.title, s.volume, p.name";
    else if (selected.publisher && !overview) {
        groupby = "i.number";
        where = " and s.title = '" + escapeSqlString(selected.title) + "' and s.volume = " + selected.volume + " and p.name = '" + escapeSqlString(selected.publisher.name) + "' ";
    } else if (selected.name && !overview) {
        groupby = "s.title, s.volume";
        where = " and p.name = '" + escapeSqlString(selected.name) + "' ";
    } else if (!overview)
        groupby = "p.name";

    if (filter.formats && filter.formats.length > 0) {
        where += " and i.format in (";
        filter.formats.map(format => where += "'" + format + "',");
        where = where.substr(0, where.length - 1);
        where += ") "
    }

    if (filter.releasedates && filter.releasedates.length > 0) {
        filter.releasedates.map(releasedate => where += " and '" + (dateFormat(new Date(releasedate.date), "yyyy-mm-dd")) + "' " + releasedate.compare + " i.releasedate ");
    }

    if (!filter.onlyCollected && filter.withVariants) {
        where += " and i.variant != '' ";
    }

    let rawQuery =
        "select " + columns +
        " from issue i" +
        " left join series s on i.fk_series = s.id" +
        " left join publisher p on s.fk_publisher = p.id" +
        " where p.original = " + us + where +
        " %INTERSECT% ";

    if (!overview)
        rawQuery += " group by " + groupby;

    let intersect = "";

    if (filter.appearances && filter.appearances.length > 0) {
        intersect += " AND i.id IN (";

        for (let i = 2; i > 0; i--) {
            intersect +=
                "select i.id " +
                " from publisher p " +
                " left join series s on p.id = s.fk_publisher " +
                " left join issue i on s.id = i.fk_series " +
                " left join " + type + " st on i.id = st.fk_issue " +
                " left join story_appearance stapp on " + (i === 2 ? "st.id" : "st.fk_parent") + " = stapp.fk_story " +
                " left join appearance app on stapp.fk_appearance = app.id " +
                " where i.id is not null " +
                " and ((app.name = '" + escapeSqlString(filter.appearances) + "'))";

            if (i === 2)
                intersect += " UNION "
        }

        intersect += " group by i.id) ";
    }

    if (filter.individuals && filter.individuals.length > 0) {
        intersect += " AND i.id IN (";

        for (let i = 2; i > 0; i--) {
            intersect +=
                "select i.id " +
                " from publisher p " +
                " left join series s on p.id = s.fk_publisher " +
                " left join issue i on s.id = i.fk_series " +
                " left join " + type + " st on i.id = st.fk_issue " +
                " left join " + type + "_individual stindi on " + (i === 2 ? "st.id" : "st.fk_parent") + " = stindi.fk_" + type + " " +
                " left join individual indi on stindi.fk_individual = indi.id " +
                " where i.id is not null " +
                " and (";

            filter.individuals.map((individual, i) => {
                if (i > 0)
                    intersect += " OR ";
                intersect += " (indi.name = '" + escapeSqlString(individual.name) + "' and stindi.type = '" + individual.type + "')";
            });

            intersect += ")";

            if (i === 2)
                intersect += " UNION "
        }

        intersect += " group by i.id) ";
    }

    if (filter.arcs && filter.arcs.length > 0) {
        intersect += " AND i.id IN (" +
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series ";

        intersect += us ? " left join issue_arc ia on i.id = ia.fk_issue " :
            " left join story st on i.id = st.fk_issue " +
            " left join story stjoin on st.fk_parent = stjoin.id " +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " left join issue_arc ia on ijoin.id = ia.fk_issue ";

        intersect += " left join arc a on ia.fk_arc = a.id " +
            " where i.id is not null " +
            " and (";

        intersect += " (a.title = '" + escapeSqlString(filter.arcs) + "')";

        intersect += ") group by i.id) ";
    }

    if (loggedIn && filter.onlyCollected && !filter.us) {
        intersect += " AND i.id IN (select i.id from issue i group by i.fk_series, i.number having max(i.collected) = 1) ";
    }

    if (loggedIn && filter.onlyNotCollected && !filter.us) {
        intersect += " AND i.id IN (select i.id from issue i group by i.fk_series, i.number having max(i.collected) = 0 or max(i.collected) is null) ";
    }

    if (loggedIn && filter.onlyCollected && filter.us) {
        intersect += " AND i.id IN (" +
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join story st on i.id = st.fk_issue " +
            " left join story stjoin on st.id = stjoin.fk_parent " +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " where p.original = 1 " +
            " and i.id is not null " +
            " and ijoin.collected = 1 group by i.id) ";
    }

    if (loggedIn && filter.onlyNotCollected && filter.us) {
        intersect += " AND i.id IN (" +
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join story st on i.id = st.fk_issue " +
            " left join story stjoin on st.id = stjoin.fk_parent " +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " where p.original = 1 " +
            " and i.id is not null " +
            " and (ijoin.collected = 0 or ijoin.collected is null) group by i.id) ";
    }

    if (filter.publishers && filter.publishers.filter(p => p.us !== filter.us).length > 0) {
        intersect += " AND i.id IN (" +
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join story st on i.id = st.fk_issue " +
            " left join story stjoin on " + (us ? "st.id =" : "st.fk_parent =") + (us ? "stjoin.fk_parent " : "stjoin.id ") +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " left join series sjoin on ijoin.fk_series = sjoin.id " +
            " left join publisher pjoin on pjoin.id = sjoin.fk_publisher " +
            " where i.id is not null " +
            " and (";

        filter.publishers.filter(p => p.us === filter.us).map((publisher, i) => {
            if (i > 0)
                intersect += " OR ";
            intersect += " (pjoin.name = '" + escapeSqlString(publisher.name) + "')";
        });

        intersect += ") group by i.id) ";
    }

    if (filter.publishers && filter.publishers.filter(p => p.us === filter.us).length > 0) {
        intersect += " AND (";

        filter.publishers.filter(p => p.us === filter.us).map((publisher, i) => {
            if (i > 0)
                intersect += " OR ";
            intersect += " (p.name = '" + escapeSqlString(publisher.name) + "')";
        });

        intersect += ") ";
    }

    if (filter.series && filter.series.filter(p => p.publisher.us !== filter.us).length > 0) {
        intersect += " AND i.id IN (" +
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join story st on i.id = st.fk_issue " +
            " left join story stjoin on " + (us ? "st.id =" : "st.fk_parent =") + (us ? "stjoin.fk_parent " : "stjoin.id ") +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " left join series sjoin on ijoin.fk_series = sjoin.id " +
            " left join publisher pjoin on pjoin.id = sjoin.fk_publisher " +
            " where i.id is not null " +
            " and (";

        filter.series.filter(p => p.publisher.us !== filter.us).map((series, i) => {
            if (i > 0)
                intersect += " OR ";
            intersect += " (sjoin.title = '" + escapeSqlString(series.title) + "' and sjoin.volume = " + series.volume + " and pjoin.name = '" + escapeSqlString(series.publisher.name) + "')";
        });

        intersect += ") group by i.id) ";
    }

    if (filter.series && filter.series.filter(p => p.publisher.us === filter.us).length > 0) {
        intersect += " AND (";

        filter.series.filter(p => p.publisher.us === filter.us).map((series, i) => {
            if (i > 0)
                intersect += " OR ";
            intersect += " (s.title = '" + escapeSqlString(series.title) + "' and s.volume = " + series.volume + ")";
        });

        intersect += ") ";
    }

    if (filter.numbers && filter.numbers.length > 0) {
        intersect += " AND i.id IN (" +
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join story st on i.id = st.fk_issue " +
            " left join story stjoin on " + (us ? "st.id =" : "st.fk_parent =") + (us ? "stjoin.fk_parent " : "stjoin.id ") +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " where i.id is not null " +
            " and (";

        filter.numbers.map((number, i) => {
            if (i > 0)
                intersect += " OR ";
            intersect += " (cast('" + number.number + "' as unsigned) " + number.compare + "cast(ijoin.number as unsigned))";
        });

        intersect += ") group by i.id) ";
    }

    let intersectContains = "";
    if ((filter.reprint || filter.exclusive) && !us) {
        intersectContains +=
            "select i.id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.fk_parent = stjoin.id" +
            " where i.id is not null " +
            " and st.id is not null and st.fk_parent is null group by i.id ";
    }

    if ((filter.reprint || filter.otherOnlyTb) && !us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id, i.format " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.fk_parent = stjoin.id" +
            " where i.id is not null " +
            " AND st.otheronlytb = 1 " +
            " AND stjoin.id IS NOT NULL " +
            " GROUP BY  st.fk_parent) a ";
    }

    if ((filter.reprint || filter.onlyPrint) && !us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id, i.format " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.fk_parent = stjoin.id" +
            " where i.id is not null " +
            " AND st.onlyapp = 1 " +
            " AND stjoin.id IS NOT NULL " +
            " GROUP BY  st.fk_parent) a ";
    }

    if ((filter.reprint || filter.firstPrint) && !us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "SELECT i.id FROM publisher p " +
            " LEFT JOIN series s ON p.id = s.fk_publisher " +
            " LEFT JOIN issue i ON s.id = i.fk_series " +
            " LEFT JOIN " + type + " st ON i.id = st.fk_issue " +
            " LEFT JOIN " + type + " stjoin ON st.fk_parent = stjoin.id " +
            " WHERE  i.id IS NOT NULL " +
            " AND st.firstapp = 1 " +
            " AND stjoin.id IS NOT NULL ";
    }

    if (filter.onlyTb && us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id, ijoin.format " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.id = stjoin.fk_parent" +
            " left join issue ijoin on stjoin.fk_issue = ijoin.id " +
            " where i.id is not null " +
            " and (i.variant IS NULL OR i.variant = '') " +
            " AND st.onlytb = 1 " +
            " AND stjoin.id IS NOT NULL) a ";
    }

    if (filter.onlyOnePrint && us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.id = stjoin.fk_parent" +
            " where i.id is not null " +
            " and (i.variant IS NULL OR i.variant = '') " +
            " AND st.onlyoneprint = 1 " +
            " AND stjoin.id IS NOT NULL) a ";
    }

    if (filter.noPrint && us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id, i.format " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.id = stjoin.fk_parent" +
            " where i.id is not null " +
            " and (i.variant IS NULL OR i.variant = '') " +
            " AND stjoin.id IS NULL " +
            " GROUP BY  i.id" +
            " ) a ";
    }

    //negated in query
    if (filter.reprint && !us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "SELECT i.id FROM publisher p " +
            " LEFT JOIN series s ON p.id = s.fk_publisher " +
            " LEFT JOIN issue i ON s.id = i.fk_series " +
            " LEFT JOIN " + type + " st ON i.id = st.fk_issue " +
            " where i.id is not null " +
            " and st.id IS NULL ";
    }

    //negated in query
    if (loggedIn && filter.sellable && !us) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select a.id from (" +
            "   select count(*) as stories, i.id from issue i " +
            "   LEFT join story st on i.id = st.fk_issue " +
            "   where i.collected = 1 group by st.fk_issue) a " +
            "   left join " +
            "       (select count(*) as stories, i.id from issue i " +
            "       LEFT join story st on i.id = st.fk_issue " +
            "       where st.fk_parent in (" +
            "           select st.fk_parent from issue i " +
            "           LEFT join story st on i.id = st.fk_issue " +
            "           where st.fk_parent is not null and i.collected = 1 and st.onlyapp not in (1) group by st.fk_parent having count(st.fk_parent) > 1) " +
            "       and i.collected = 1 group by st.fk_issue) b " +
            "   on a.id = b.id where a.stories = b.stories ";
    }

    if (intersectContains !== "")
        intersect += " and i.id " + (filter.reprint ? "not in" : "in") + " (" + intersectContains + ")";

    rawQuery = rawQuery.replace("%INTERSECT%", intersect);

    if (order) {
        if (!sort)
            sort = 'DESC';

        switch (order) {
            case 'releasedate':
            case 'updatedAt':
            case 'createdAt':
                rawQuery += " ORDER BY i." + order + " " + sort;
                break;
            case 'series':
                rawQuery += " ORDER BY s.title " + sort + ", s.volume " + sort + ", i.number ";
                break;
            case 'publisher':
                rawQuery += " ORDER BY p.name " + sort + ", s.title, s.volume, i.number ";
                break;
        }
    } else {
        let fromRoman = "CASE WHEN fromRoman(i.number) = 0 THEN 999 ELSE fromRoman(i.number) END";

        if (!selected) {
            rawQuery += " ORDER BY p.name, s.title, s.volume, " + fromRoman + ", cast(i.number as unsigned) DESC";
        } else if (selected.name) {
            rawQuery += " ORDER BY s.title, s.volume, p.name, " + fromRoman + ", cast(i.number as unsigned) DESC";
        } else if (selected.title) {
            rawQuery += " ORDER BY " + fromRoman + ", cast(i.number as unsigned), s.title, s.volume, p.name DESC";
        }
    }

    if (!print && offset !== undefined)
        rawQuery += " LIMIT " + offset + ", 50";

    //console.log(rawQuery + "\n\n");

    return rawQuery;
}
