import {gql} from 'apollo-server';
import models from "../models";
import {asyncForEach, generateLabel, naturalCompare} from "../util/util";

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
    noPrint: Boolean
  }
  
  extend type Query {
    export(filter: Filter!): String
  }
`;

export const resolvers = {
    Query: {
        export: async (_, {filter}) => {
            let rawQuery = createFilterQuery(filter.us, filter, true);
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

    if (!filter.firstPrint && !filter.onlyPrint && !filter.otherTb && !filter.exclusive && !filter.onlyTb && !filter.noPrint)
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

export function createFilterQuery(selected, filter, print) {
    let typeTable = filter.story ? "Story" : filter.cover ? "Cover" : "Feature";
    let us = filter.us;

    if ((us ? 1 : 0) + (filter.feature ? 1 : 0) > 1)
        throw new Error("Kombination nicht erlaubt");

    if ((filter.story ? 1 : 0) + (filter.cover ? 1 : 0) + (filter.feature ? 1 : 0) > 1)
        throw new Error("Kombination nicht erlaubt");

    if((us ? 1 : 0) + (filter.onlyTb ? 1 : 0) + (filter.noPrint ? 1 : 0) > 2)
        throw new Error("Kombination nicht erlaubt");

    if((!us ? 1 : 0) + (filter.firstPrint ? 1 : 0) + (filter.onlyPrint ? 1 : 0)  + (filter.otherTb ? 1 : 0)  + (filter.exclusive ? 1 : 0) > 2)
        throw new Error("Kombination nicht erlaubt");

    let where = "";

    if(filter.formats && filter.formats.length > 0) {
        let formats = "";
        filter.formats.map(format => formats += "'" + format + "', ");
        formats = formats.substring(0, formats.length-2);
        where += "WHERE l1.issueformat IN (" + formats + ") ";
    }

    if(filter.releasedates && filter.releasedates.length > 0) {
        let releasedates = "";
        filter.releasedates.map(releasedate => releasedates += "'"+ (dateFormat(new Date(releasedate.date), "yyyy-mm-dd") + "' " + releasedate.compare + " l1.issuereleasedate AND "));
        releasedates = releasedates.substring(0, releasedates.length-5);
        where += (where === "" ? "WHERE " : " AND ") + releasedates + " ";
    }

    if(filter.withVariants)
        where += (where === "" ? "WHERE " : " AND ") + "l1.issuevariant IS NOT NULL AND l1.issuevariant != '' ";

    let joinwhere = "";

    if(filter.publishers && filter.publishers.length > 0) {
        let publishers = "";
        filter.publishers.map(publisher => publishers += "'" + publisher.name + "', ");
        publishers = publishers.substring(0, publishers.length - 2);
        joinwhere += " AND " + "pjoin.name IN (" + publishers + ") ";
    }

    if(filter.series && filter.series.length > 0) {
        let series = "";
        filter.series.map(s => series += ("(sjoin.title = '" + s.title + "' AND sjoin.volume = " + s.volume + " AND pjoin.name = '" + s.publisher.name + "') AND "));
        series = series.substring(0, series.length-5);
        joinwhere += " AND " + series + " ";
    }

    if(filter.numbers && filter.numbers.length > 0) {
        if (us)
            filter.numbers.map(number => {
                joinwhere += (where === "" ? "WHERE " : " AND ") + "('" + number.number + "' " + number.compare + " l1.issuenumber AND l1.issuevariant LIKE '%" + number.variant + "%') "
            });
        else
            filter.numbers.map(number => {
                joinwhere += " AND " + "('" + number.number + "' " + number.compare + " ijoin.number AND ijoin.variant LIKE '%" + number.variant + "%') "
            });
    }

    if(filter.individuals && filter.individuals.length > 0) {
        let where = "";
        filter.individuals.map(individual => {
            if (us)
                where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname = '" + individual.name + "' AND l1.individualtype = '" + individual.type + "') ";
            else
                joinwhere += " AND " + "(ivjoin.name = '" + individual.name + "' AND sijoin.type = '" + individual.type + "') ";
        });
    }

    if (filter.arcs && filter.arcs.length > 0) {
        let arcs = "";
        filter.arcs.map(arc => arcs += " CONCAT('" + arc.title + "', '#', '" + arc.type + "'), ");
        arcs = arcs.substring(0, arcs.length - 2);

        if (us)
            where += (where === "" ? "WHERE " : " AND ") + " CONCAT(l1.arctitle, '#', l1.arctype) IN (" + arcs + ") ";
        else
            joinwhere += " AND " + " CONCAT(ajoin.title, '#', ajoin.type) IN (" + arcs + ") ";
    }

    if(selected.publisher)
        where += (where === "" ? "WHERE " : " AND ") + "(l1.seriestitle = '" + selected.title + "' AND l1.seriesvolume = " + selected.volume + " AND l1.publishername = '" + selected.publisher.name + "') ";
    else if(selected.name)
        where += (where === "" ? "WHERE " : " AND ") + "l1.publishername = '" + selected.name + "' ";

    let includeFilter = "";

    let filterInclude =
        "                   FROM      publisher p " +
        "                       LEFT JOIN series s " +
        "                       ON        s.fk_publisher = p.id " +
        "                       AND       p.original = " + (us ? 1 : 0) +
        "                       LEFT JOIN issue i " +
        "                       ON        i.fk_series = s.id " +
        "                       LEFT JOIN issue_arc ia " +
        "                       ON        ia.fk_issue = i.id " +
        "                       LEFT JOIN arc a " +
        "                       ON a.id = ia.fk_arc " +
        "                       LEFT JOIN " + typeTable + " st " +
        "                       ON        st.fk_issue = i.id " +
        "                       LEFT JOIN " + typeTable + " stjoin " +
        "                       ON        " + (us ? "stjoin.fk_parent = st.id" : "stjoin.id = st.fk_parent") +
        "                       LEFT JOIN " + typeTable + "_individual sijoin " +
        "                       ON        sijoin.fk_" + typeTable + " = stjoin.id " +
        "                       LEFT JOIN individual ivjoin " +
        "                       ON        ivjoin.id = sijoin.fk_individual " +
        "                       LEFT JOIN issue ijoin " +
        "                       ON        ijoin.id = stjoin.fk_issue " +
        "                       LEFT JOIN issue_arc iajoin " +
        "                       ON        iajoin.fk_issue = ijoin.id " +
        "                       LEFT JOIN arc ajoin " +
        "                       ON ajoin.id = iajoin.fk_arc " +
        "                       LEFT JOIN series sjoin " +
        "                       ON        sjoin.id = ijoin.fk_series " +
        "                       LEFT JOIN publisher pjoin " +
        "                       ON        pjoin.id = sjoin.fk_publisher " +
        "                   WHERE     p.original = " + (us ? 1 : 0) +
        "                   " + joinwhere + " ";

    if(filter.onlyTb)
        includeFilter =
            "        AND " +
            "        ( " +
            "          i.variant IS NULL OR i.variant = '' " +
            "        ) " +
            "        AND i.id in " +
            "        ( " +
            "            SELECT id FROM ( " +
            "                   SELECT    i.id          AS id, ijoin.format " +
            "                   " + filterInclude +
            "                   GROUP BY st.id " +
            "                   HAVING count(*) = 1 AND ijoin.format = 'Taschenbuch') a) ";

    if(filter.noPrint)
        includeFilter =
            "        AND stjoin.id IS NULL " +
            "        AND " +
            "        ( " +
            "          i.variant IS NULL OR i.variant = '' " +
            "        ) "+
            "        AND i.id in " +
            "        ( " +
            "            SELECT id FROM ( " +
            "                   SELECT    i.id          AS id, ijoin.format " +
            "                   " + filterInclude +
            "                   ) a) ";

    if(filter.firstPrint)
        includeFilter =
            "        AND st.id IS NOT NULL " +
            "        AND concat (stjoin.id, '#', i.releasedate) in " +
            "        ( " +
            "            SELECT firstprint FROM ( " +
            "                   SELECT    concat(stjoin.id, '#', min(i.releasedate)) as firstprint " +
            "                   " + filterInclude +
            "                   AND       stjoin.id IS NOT NULL " +
            "                   GROUP BY  stjoin.id) a) ";

    if(filter.onlyPrint)
        includeFilter =
            "        AND st.id IS NOT NULL " +
            "        AND i.id in " +
            "        ( " +
            "            SELECT id FROM ( " +
            "                   SELECT    i.id          AS id " +
            "                   " + filterInclude +
            "                   AND       stjoin.id IS NOT NULL " +
            "                   GROUP BY  st.fk_parent " +
            "                   HAVING count(distinct concat(s.id, '#', i.number)) = 1) a) ";

    if(filter.otherTb)
        includeFilter =
            "        AND st.id IS NOT NULL " +
            "        AND i.id in " +
            "        ( " +
            "            SELECT id FROM ( " +
            "                   SELECT    i.id          AS id " +
            "                   " + filterInclude +
            "                   AND       stjoin.id IS NOT NULL " +
            "                   GROUP BY  st.fk_parent " +
            "                   HAVING count(DISTINCT i.id) - count(DISTINCT CASE WHEN i.format = 'Taschenbuch' THEN i.id ELSE NULL END) = 1 " +
            "                       AND count(DISTINCT CASE WHEN i.format = 'Taschenbuch' THEN i.id ELSE NULL END) > 0) a WHERE i.format != 'Taschenbuch' ) ";

    if(filter.exclusive)
        includeFilter =
            "        AND " +
            "        ( " +
            "          st.id IS NOT NULL " +
            "          AND st.fk_parent IS NULL " +
            "        )" +
            "        AND i.id in " +
            "        ( " +
            "            SELECT id FROM ( " +
            "                   SELECT    i.id          AS id " +
            "                   " + filterInclude +
            "            ) a) ";

    if(includeFilter === '')
        includeFilter =
            "        AND i.id in " +
            "        ( " +
            "            SELECT id FROM ( " +
            "                   SELECT    i.id          AS id " +
            "                   " + filterInclude +
            "            ) a) ";

    let columns = "";
    if (print)
        columns = "publishername, seriestitle, seriesvolume, seriesstartyear, seriesendyear, issuenumber, issuevariant";
    else if (selected.publisher)
        columns = "issuenumber, issueformat, issuevariant, seriesid";
    else if(selected.name)
        columns = "seriestitle, seriesvolume, seriesstartyear, seriesendyear, publisherid";
    else
        columns = "publishername";

    let groupby = "";
    if (print)
        groupby = "issuenumber, seriestitle, seriesvolume, publishername";
    else if (selected.publisher)
        groupby = "issuenumber";
    else if(selected.name)
        groupby = "seriestitle, seriesvolume";
    else
        groupby = "publishername";

    let rawQuery =
        "SELECT   " + columns + " " +
        "FROM     ( " +
        "                   SELECT    p.name        AS publishername, " +
        "                             p.original    AS publisheroriginal, " +
        "                             p.id          AS publisherid, " +
        "                             s.id          AS seriesid, " +
        "                             s.title       AS seriestitle, " +
        "                             s.volume      AS seriesvolume, " +
        "                             s.startyear   AS seriesstartyear, " +
        "                             s.endyear     AS seriesendyear, " +
        "                             i.number      AS issuenumber, " +
        "                             i.format      AS issueformat, " +
        "                             i.variant     AS issuevariant, " +
        "                             i.releasedate AS issuereleasedate, " +
        "                             iv.name       AS individualname, " +
        "                             a.title       AS arctitle, " +
        "                             a.type        AS arctype, " +
        "                             si.type       AS individualtype " +
        "                   FROM      publisher p " +
        "                   LEFT JOIN series s " +
        "                   ON        s.fk_publisher = p.id " +
        "                   AND       p.original = " + (us ? "1" : "0") +
        "                   LEFT JOIN issue i " +
        "                   ON        i.fk_series = s.id " +
        "                   LEFT JOIN issue_arc ia " +
        "                   ON        ia.fk_issue = i.id " +
        "                   LEFT JOIN arc a " +
        "                   ON a.id = ia.fk_arc " +
        "                   LEFT JOIN " + typeTable + " st " +
        "                   ON        st.fk_issue = i.id " +
        "                   LEFT JOIN " + typeTable + "_individual si " +
        "                   ON        si.fk_" + typeTable + " = st.id " +
        "                   LEFT JOIN individual iv " +
        "                   ON        iv.id = si.fk_individual " +
        (!filter.feature ?
            "                   LEFT JOIN " + typeTable + " stjoin " +
            "                   ON        " + (!us ? "stjoin.id = st.fk_parent" : "stjoin.fk_parent = st.id") : "") +
        "                   WHERE     p.original = " + (us ? "1" : "0") +
        "                   " + includeFilter + " " +
        "         ) l1 " +
        " " + where + " " +
        "GROUP BY " + groupby + ";";

    console.log(rawQuery);

    return rawQuery;
}
