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
    writers: [IndividualInput],
    artists: [IndividualInput],
    inkers: [IndividualInput],
    colourists: [IndividualInput],
    letteres: [IndividualInput],
    editors: [IndividualInput],
    translators: [IndividualInput],
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

    if (filter.writers) {
        s += "\t\tAutor: ";
        filter.writers.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.artists) {
        s += "\t\tZeichner: ";
        filter.artists.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.inkers) {
        s += "\t\tInker: ";
        filter.inkers.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.colourists) {
        s += "\t\tKolorist: ";
        filter.colourists.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.letterers) {
        s += "\t\tLetterer: ";
        filter.letterers.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.editors) {
        s += "\t\tEditor: ";
        filter.editors.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }

    if (filter.translators) {
        s += "\t\tÜbersetzer: ";
        filter.translators.forEach(i => s += i.name + ", ");
        s = s.substr(0, s.length - 2) + "\n";
    }


    if (!filter.writers && !filter.artists && !filter.inkers && !filter.colourists && !filter.letterers && !filter.editors && !filter.translators)
        s += "\t\t-\n";

    return s + "\n\n";
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

    if(us && filter.translators)
        throw new Error("Kombination nicht erlaubt");

    if (filter.cover) {
        if ((filter.cover ? 1 : 0) + (filter.writers ? 1 : 0) + (filter.inkers ? 1 : 0) + (filter.colourists ? 1 : 0) + (filter.letterers ? 1 : 0) + (filter.editors ? 1 : 0) + (filter.translators ? 1 : 0) > 1)
            throw new Error("Kombination nicht erlaubt");
    }

    if (filter.feature) {
        if ((filter.feature ? 1 : 0) + (filter.firstPrint ? 1 : 0) + (filter.onlyPrint ? 1 : 0) + (filter.otherTb ? 1 : 0) + (filter.exclusive ? 1 : 0) + (filter.publishers ? 1 : 0)
            + (filter.series ? 1 : 0) + (filter.pencilers ? 1 : 0) + (filter.inkers ? 1 : 0) + (filter.colourists ? 1 : 0) + (filter.letterers ? 1 : 0) + (filter.editors ? 1 : 0) + (filter.translators ? 1 : 0) > 1)
            throw new Error("Kombination nicht erlaubt");
    }

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
        let numbers = "";
        filter.numbers.map(number => numbers += ("'" + number.number + "' " + number.compare + " ijoin.number AND ijoin.variant LIKE '%" + number.variant + "%' "));
        numbers = numbers.substring(0, numbers.length-5);
        joinwhere += " AND " + numbers + " ";
    }

    if(filter.writers && filter.writers.length > 0) {
        let writers = "";
        filter.writers.map(writer => writers += "'" + writer.name + "', ");
        writers = writers.substring(0, writers.length-2);
        if (us)
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + writers + ") AND l1.individualtype = 'WRITER') ";
        else
            joinwhere += " AND " + "(ivjoin.name IN (" + writers + ") AND sijoin.type = 'WRITER') ";
    }

    if(filter.artists && filter.artists.length > 0) {
        let artists = "";
        filter.artists.map(artist => artists += "'" + artist.name + "', ");
        artists = artists.substring(0, artists.length-2);
        if (us)
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + artists + ") AND l1.individualtype = 'ARTIST') ";
        else
            joinwhere += " AND " + "(ivjoin.name IN (" + artists + ") AND sijoin.type = 'ARTIST') ";
    }

    if (filter.letterers && filter.letterers.length > 0) {
        let letterers = "";
        filter.letterers.map(letterer => letterers += "'" + letterer.name + "', ");
        letterers = letterers.substring(0, letterers.length - 2);
        if (us)
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + letterers + ") AND l1.individualtype = 'LETTERER') ";
        else
            joinwhere += " AND " + "(ivjoin.name IN (" + letterers + ") AND sijoin.type = 'LETTERER') ";
    }

    if(filter.inkers && filter.inkers.length > 0) {
        let inkers = "";
        filter.inkers.map(inker => inkers += "'" + inker.name + "', ");
        inkers = inkers.substring(0, inkers.length-2);
        if (us)
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + inkers + ") AND l1.individualtype = 'INKER') ";
        else
            joinwhere += " AND " + "(ivjoin.name IN (" + inkers + ") AND sijoin.type = 'INKER') ";
    }

    if(filter.colourists && filter.colourists.length > 0) {
        let colourists = "";
        filter.colourists.map(colourist => colourists += "'" + colourist.name + "', ");
        colourists = colourists.substring(0, colourists.length-2);
        if (us)
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + colourists + ") AND l1.individualtype = 'COLOURIST') ";
        else
            joinwhere += " AND " + "(ivjoin.name AND sijoin.type = 'COLOURIST') ";
    }

    if(filter.editors && filter.editors.length > 0) {
        let editors = "";
        filter.editors.map(editor => editors += "'" + editor.name + "', ");
        editors = editors.substring(0, editors.length-2);
        if (us)
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + editors + ") AND l1.individualtype = 'EDITOR') ";
        else
            joinwhere += " AND " + "(ivjoin.name IN (" + editors + ") AND sijoin.type = 'EDITOR') ";
    }

    if(filter.translators && filter.translators.length > 0) {
        let translators = "";
        filter.translators.map(translator => translators += "'" + translator.name + "', ");
        translators = translators.substring(0, translators.length-2);
        if (us)
            joinwhere += " AND " + "(ivjoin.name IN (" + translators + ") AND sijoin.type = 'TRANSLATOR') ";
        else
            where += (where === "" ? "WHERE " : " AND ") + "(l1.individualname IN (" + translators + ") AND l1.individualtype = 'TRANSLATOR') ";
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
        columns = "publishername, seriestitle, seriesvolume, seriesstartyear, seriesendyear, issuenumber";
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

    return rawQuery;
}