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
    story: Boolean,
    cover: Boolean,
    feature: Boolean,
    formats: [String],
    withVariants: Boolean,
    releasedates: [DateFilter],
    publishers: [PublisherInput],
    series: [SeriesInput],
    numbers: [NumberFilter],
    arcs: [ArcInput],
    individuals: [IndividualInput],
    appearances: [AppearanceInput],
    firstPrint: Boolean,
    onlyPrint: Boolean,
    otherTb: Boolean,
    exclusive: Boolean,
    onlyTb: Boolean,
    noPrint: Boolean,
    onlyOnePrint: Boolean
  }
  
  extend type Query {
    export(filter: Filter!): String
  }
`;

export const resolvers = {
    Query: {
        export: async (_, {filter}) => {
            let rawQuery = createFilterQuery(filter.us, filter, 0, true);
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
                    publisher: null
                };
                let issue = {
                    number: r.issuenumber,
                    series: series
                };

                let publisherLabel = await generateLabel(publisher);
                let seriesLabel = await generateLabel(series);

                if(publisherLabel in response) {
                    if(seriesLabel in response[publisherLabel])
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
                        i.series = undefined;
                        return i;
                    }).sort((a, b) => naturalCompare(a.number, b.number))];
                }).sort()];
            }).sort();

            let responseString = "";

            sortedResponse.forEach(p => {
                responseString += p[0] + "\n";
                p[1].forEach(s => {
                    responseString += "\t" + s[0] + "\n";
                    s[1].forEach(i => {
                        responseString += "\t\t#" + i.number + "\n";
                    })
                });
                responseString += "\n";
            });

            return JSON.stringify(await convertFilterToString(filter) + responseString);
        }
    }
};

async function convertFilterToString(filter) {
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

    if (filter.story)
        s += "\tFiltern nach Geschichte\n";
    if (filter.cover)
        s += "\tFiltern nach Cover\n";
    if (filter.feature)
        s += "\tFiltern nach sonstigen Inhalten\n";

    s += "\tEnthält\n";
    if (filter.firstPrint)
        s += "\t\tErstausgabe\n";
    if (filter.onlyPrint)
        s += "\t\tEinzige Ausgabe\n";
    if (filter.otherTb)
        s += "\t\tSonst nur in TB\n";
    if (filter.exclusive)
        s += "\t\tExclusiv\n";
    if (filter.onlyTb)
        s += "\t\tNur in TB\n";
    if (filter.onlyOnePrint)
        s += "\t\tNur einfach auf deutsch erschienen\n";
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

    if (!filter.firstPrint && !filter.onlyPrint && !filter.otherTb && !filter.exclusive && !filter.onlyTb && !filter.noPrint && !filter.onlyOnePrint)
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

export function createFilterQuery(selected, filter, offset, print) {
    let type = filter.story ? "story" : filter.cover ? "cover" : "feature";
    let us = filter.us ? 1 : 0;

    let columns = "p.name as publishername, p.id as publisherid, " +
        "s.title as seriestitle, s.volume as seriesvolume, s.startyear as seriesstartyear, s.endyear as seriesendyear, s.id as seriesid, " +
        "i.number as issuenumber, i.variant as issuevariant, i.id as issueid ";

    let groupby = "";
    let where = "";

    if (print)
        groupby = "i.number, s.title, s.volume, p.name";
    else if (selected.publisher) {
        groupby = "i.number";
        where = " and s.title = '" + escapeSqlString(selected.title) + "' and s.volume = " + selected.volume + " and p.name = '" + escapeSqlString(selected.publisher.name) + "' ";
    }
    else if(selected.name) {
        groupby = "s.title, s.volume";
        where = " and p.name = '" + escapeSqlString(selected.name) + "' ";
    }
    else
        groupby = "p.name";

    if(filter.formats && filter.formats.length > 0) {
        where += " and i.format in (";
        filter.formats.map(format => where += "'" + format + "',");
        where = where.substr(0, where.length-1);
        where += ") "
    }

    if(filter.releasedates && filter.releasedates.length > 0) {
        filter.releasedates.map(releasedate => where += " and i.releasedate " + releasedate.compare + " '" + (dateFormat(new Date(releasedate.date), "yyyy-mm-dd")) + "' ");
    }

    if(filter.withVariants) {
        where += " and i.variant != '' ";
    }

    let rawQuery =
        "select " + columns +
        " from issue i" +
        " left join series s on i.fk_series = s.id" +
        " left join publisher p on s.fk_publisher = p.id" +
        " where p.original = " + us + where +
        " %INTERSECT% " +
        " group by " + groupby;

    let intersect = "";

    if(filter.appearances && filter.appearances.length > 0 && (filter.cover || filter.story)) {
        intersect += " AND i.id IN (";

        for(let i = 2; i > 0; i--) {
            intersect +=
                "select i.id " +
                " from publisher p " +
                " left join series s on p.id = s.fk_publisher " +
                " left join issue i on s.id = i.fk_series " +
                " left join " + type + " st on i.id = st.fk_issue " +
                " left join story_appearance stapp on " + (i === 2 ? "st.id" : "st.fk_parent") + " = stapp.fk_story " +
                " left join appearance app on stapp.fk_appearance = app.id " +
                " where i.id is not null " +
                " and (";

            filter.appearances.map((app, i) => {
                if(i > 0)
                    intersect += " OR ";
                intersect += " (app.name = '" + escapeSqlString(app.name) + "' and app.type = '" + app.type + "'))";
            });

            if(i === 2)
                intersect += " UNION "
        }

        intersect += " group by i.id) ";
    }

    if(filter.individuals && filter.individuals.length > 0) {
        intersect += " AND i.id IN (";

        for(let i = 2; i > 0; i--) {
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
                if(i > 0)
                    intersect += " OR ";
                intersect += " (indi.name = '" + escapeSqlString(individual.name) + "' and stindi.type = '" + individual.type + "'))";
            });

            if(i === 2)
                intersect += " UNION "
        }

        intersect += " group by i.id) ";
    }

    if(filter.arcs && filter.arcs.length > 0) {
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

        filter.arcs.map((arc, i) => {
            if(i > 0)
                intersect += " OR ";
            intersect += " (a.title = '" + escapeSqlString(arc.title) + "' and a.type = '" + arc.type + "')";
        });

        intersect += ") group by i.id) ";
    }

    if(filter.publishers && filter.publishers.length > 0) {
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

        filter.publishers.map((publisher, i) => {
            if(i > 0)
                intersect += " OR ";
            intersect += " (pjoin.name = '" + escapeSqlString(publisher.name) + "')";
        });

        intersect += ") group by i.id) ";
    }

    if(filter.series && filter.series.length > 0) {
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

        filter.series.map((series, i) => {
            if(i > 0)
                intersect += " OR ";
            intersect += " (sjoin.title = '" + escapeSqlString(series.title) + "' and sjoin.volume = " + series.volume + " and pjoin.name = '" + escapeSqlString(series.publisher.name) + "')";
        });

        intersect += ") group by i.id) ";
    }

    if(filter.numbers && filter.numbers.length > 0) {
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
            if(i > 0)
                intersect += " OR ";
            intersect += " (cast(ijoin.number as unsigned) " + number.compare + "cast('" + number.number + "' as unsigned))";
        });

        intersect += ") group by i.id) ";
    }

    let intersectContains = "";
    if(filter.exclusive && !us && (filter.cover || filter.story)) {
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

    if(filter.otherTb && !us && (filter.cover || filter.story)) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id, i.format " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.fk_parent = stjoin.id" +
            " where i.id is not null " +
            " AND stjoin.id IS NOT NULL " +
            " GROUP BY  st.fk_parent" +
            " HAVING count(DISTINCT i.id) - count(DISTINCT CASE WHEN i.format = 'Taschenbuch' THEN i.id ELSE NULL END) = 1 " +
            " AND count(DISTINCT CASE WHEN i.format = 'Taschenbuch' THEN i.id ELSE NULL END) > 0" +
            " and i.format != 'Taschenbuch') a ";
    }

    if(filter.onlyPrint && !us && (filter.cover || filter.story)) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "select id from ( " +
            " select i.id as id, i.format " +
            " from publisher p " +
            " left join series s on p.id = s.fk_publisher " +
            " left join issue i on s.id = i.fk_series " +
            " left join " + type + " st on i.id = st.fk_issue " +
            " left join " + type + " stjoin ON st.fk_parent = stjoin.id" +
            " where i.id is not null " +
            " AND stjoin.id IS NOT NULL " +
            " GROUP BY  st.fk_parent" +
            " HAVING count(distinct concat(s.id, '#', i.number)) = 1) a ";
    }

    if(filter.firstPrint && !us && (filter.cover || filter.story)) {
        intersectContains += (intersectContains !== "" ? " UNION " : "") +
            "SELECT i.id FROM publisher p " +
            " LEFT JOIN series s ON p.id = s.fk_publisher " +
            " LEFT JOIN issue i ON s.id = i.fk_series " +
            " LEFT JOIN " + type + " st ON i.id = st.fk_issue " +
            " LEFT JOIN " + type + " stjoin ON st.fk_parent = stjoin.id " +
            " WHERE  i.id IS NOT NULL " +
            " AND stjoin.id IS NOT NULL " +
            " AND Concat(stjoin.id, '#', i.releasedate) IN ( " +
            "   SELECT Concat(stjoin.id, '#', Min(i.releasedate)) FROM publisher p " +
            "   LEFT JOIN series s ON p.id = s.fk_publisher " +
            "   LEFT JOIN issue i ON s.id = i.fk_series " +
            "   LEFT JOIN " + type + " st ON i.id = st.fk_issue " +
            "   LEFT JOIN " + type + " stjoin ON st.fk_parent = stjoin.id " +
            "   WHERE i.id IS NOT NULL " +
            "   AND stjoin.id IS NOT NULL " +
            "   GROUP BY stjoin.id) ";
    }

    if(filter.onlyTb && us && (filter.cover || filter.story)) {
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
            " AND stjoin.id IS NOT NULL " +
            " GROUP BY  st.id" +
            " HAVING count(*) = 1 " +
            " AND ijoin.format = 'Taschenbuch') a ";
    }

    if(filter.onlyOnePrint && us && (filter.cover || filter.story)) {
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
            " AND stjoin.id IS NOT NULL " +
            " GROUP BY  st.id " +
            " HAVING count(*) = 1 " +
            " ) a ";
    }

    if(filter.noPrint && us && (filter.cover || filter.story)) {
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

    if(intersectContains !== "")
        intersect += " and i.id in (" + intersectContains + ")";

    rawQuery = rawQuery.replace("%INTERSECT%", intersect);
    if(!print)
        rawQuery += " LIMIT " + offset + ", 50";

    return rawQuery;
}
