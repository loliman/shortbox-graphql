import {gql} from 'apollo-server';

var dateFormat = require('dateformat');

export const typeDef = gql`
 input DateFilter {
    date: Date,
    compare: String
  }
  
  input NumberFilter {
    number: String,
    compare: String
  }
  
  input Filter {
    formats: [String],
    withVariants: Boolean,
    releasedates: [DateFilter],
    publishers: [PublisherInput],
    series: [SeriesInput],
    numbers: [NumberFilter],
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
`;

export function createFilterQuery(selected, filter) {
    let us = selected.publisher ? selected.publisher.us : selected.name ? selected.us : selected;

    if((us ? 1 : 0) + (filter.onlyTb ? 1 : 0) + (filter.noPrint ? 1 : 0) > 2)
        throw new Error("Kombination nicht erlaubt");

    if((!us ? 1 : 0) + (filter.firstPrint ? 1 : 0) + (filter.onlyPrint ? 1 : 0)  + (filter.otherTb ? 1 : 0)  + (filter.exclusive ? 1 : 0) > 2)
        throw new Error("Kombination nicht erlaubt");

    if(us && filter.translators)
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

    if(filter.publishers && filter.publishers.length > 0) {
        let publishers = "";
        filter.publishers.map(publisher => publishers += "'" + publisher.name + "', ");
        publishers = publishers.substring(0, publisher.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "l1.joinpublishername IN (" + publishers + ") ";
    }

    if(filter.series && filter.series.length > 0) {
        let series = "";
        filter.series.map(s => series += ("(l1.joinseriestitle = '" + s.title + "' AND l1.joinseriesvolume = " + s.volume + ") AND "));
        series = series.substring(0, series.length-5);
        where += (where === "" ? "WHERE " : " AND ") + series + " ";
    }

    if(filter.numbers && filter.numbers.length > 0) {
        let numbers = "";
        filter.numbers.map(number => numbers += (number.numbe + " " + number.compare + " l1.joinissuenumber AND "));
        numbers = numbers.substring(0, numbers.length-5);
        where += (where === "" ? "WHERE " : " AND ") + numbers + " ";
    }

    if(filter.writers && filter.writers.length > 0) {
        let writers = "";
        filter.writers.map(writer => writers += "'" + writer.name + "', ");
        writers = writers.substring(0, writers.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "(l1.joinindividualname IN (" + writers + ") AND l1.joinindividualtype = 'WRITER') ";
    }

    if(filter.artists && filter.artists.length > 0) {
        let artists = "";
        filter.artists.map(artist => artists += "'" + artist.name + "', ");
        artists = artists.substring(0, artists.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "(l1.joinindividualname IN (" + artists + ") AND l1.joinindividualtype = 'ARTIST') ";
    }

    if(filter.inkers && filter.inkers.length > 0) {
        let inkers = "";
        filter.inkers.map(inker => inkers += "'" + inker.name + "', ");
        inkers = inkers.substring(0, inkers.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "(l1.joinindividualname IN (" + inkers + ") AND l1.joinindividualtype = 'INKER') ";
    }

    if(filter.colourists && filter.colourists.length > 0) {
        let colourists = "";
        filter.colourists.map(colourist => colourists += "'" + colourist.name + "', ");
        colourists = colourists.substring(0, colourists.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "(l1.joinindividualname IN (" + colourists + ") AND l1.joinindividualtype = 'COLOURIST') ";
    }

    if(filter.editors && filter.editors.length > 0) {
        let editors = "";
        filter.editors.map(editor => editors += "'" + editor.name + "', ");
        editors = editors.substring(0, editors.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "(l1.joinindividualname IN (" + editors + ") AND l1.joinindividualtype = 'EDITOR') ";
    }

    if(filter.translators && filter.translators.length > 0) {
        let translators = "";
        filter.translators.map(translator => translators += "'" + translator.name + "', ");
        translators = translators.substring(0, translators.length-2);
        where += (where === "" ? "WHERE " : " AND ") + "(l1.joinindividualname IN (" + translators + ") AND l1.joinindividualtype = 'TRANSLATOR') ";
    }

    if(selected.publisher)
        where += (where === "" ? "WHERE " : " AND ") + "(l1.seriestitle = '" + selected.title + "' AND l1.seriesvolume = " + selected.volume + " AND l1.publishername = '" + selected.publisher.name + "') ";
    else if(selected.name)
        where += (where === "" ? "WHERE " : " AND ") + "l1.publishername = '" + selected.name + "' ";

    let includeFilter = "";

    if(filter.onlyTb)
        includeFilter =
            "        AND " +
            "        ( " +
            "          i.variant IS NULL OR i.variant = '' " +
            "        ) " +
            "        GROUP BY st.id " +
            "        HAVING count(*) = 1 AND ijoin.format = 'Taschenbuch' ";
    if(filter.noPrint)
        includeFilter =
            "        AND stjoin.id IS NULL " +
            "        AND " +
            "        ( " +
            "          i.variant IS NULL OR i.variant = '' " +
            "        ) ";
    if(filter.firstPrint)
        includeFilter =
            "        AND stjoin.id IS NOT NULL " +
            "        AND concat (stjoin.id, '#', i.releasedate) IN " +
            "        ( " +
            "            SELECT    concat (stjoin.id, '#', min(i.releasedate)) " +
            "            FROM      publisher p " +
            "            LEFT JOIN series s " +
            "            ON        s.fk_publisher = p.id " +
            "            AND       p.original = 0 " +
            "            LEFT JOIN issue i " +
            "            ON        i.fk_series = s.id " +
            "            LEFT JOIN story st " +
            "            ON        st.fk_issue = i.id " +
            "            LEFT JOIN story stjoin " +
            "            ON        st.fk_parent = stjoin.id " +
            "            WHERE     p.original = 0 " +
            "            AND       stjoin.id IS NOT NULL " +
            "            GROUP BY  stjoin.id) ";
    if(filter.onlyPrint)
        includeFilter =
            "        AND st.id IS NOT NULL " +
            "        GROUP BY st.fk_parent " +
            "        HAVING count(*) = 1 ";
    if(filter.otherTb)
        includeFilter =
            "        AND st.id IS NOT NULL " +
            "        GROUP BY stjoin.id " +
            "        HAVING count(DISTINCT i.id) - count(DISTINCT CASE WHEN i.format = 'Taschenbuch' THEN i.id ELSE NULL END) = 1 " +
            "        AND count(DISTINCT CASE WHEN i.format = 'Taschenbuch' THEN i.id ELSE NULL END) > 0 ";
    if(filter.exclusive)
        includeFilter =
            "        AND " +
            "        ( " +
            "          st.id IS NOT NULL " +
            "          AND st.fk_parent IS NULL " +
            "        ) ";

    let columns = "";
    if(selected.publisher)
        columns = "issuenumber, issueformat, issuevariant, seriesid";
    else if(selected.name)
        columns = "seriestitle, seriesvolume, seriesstartyear, seriesendyear, publisherid";
    else
        columns = "publishername";

    let groupby = "";
    if(selected.publisher)
        groupby = "issuenumber";
    else if(selected.name)
        groupby = "seriestitle, seriesvolume";
    else
        groupby = "publishername";

    let rawQuery =
        "SELECT   " + columns+ " " +
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
        "                             si.type       AS individualtype, " +
        "                             pjoin.name    AS joinpublishername, " +
        "                             sjoin.title   AS joinseriestitle, " +
        "                             sjoin.volume  AS joinseriesvolume, " +
        "                             ijoin.number  AS joinissuenumber, " +
        "                             ijoin.format  AS joinissueformat, " +
        "                             ivjoin.name   AS joinindividualname, " +
        "                             sijoin.type   AS joinindividualtype " +
        "                   FROM      publisher p " +
        "                   LEFT JOIN series s " +
        "                   ON        s.fk_publisher = p.id " +
        "                   AND       p.original = " + (us ? "1" : "0") +
        "                   LEFT JOIN issue i " +
        "                   ON        i.fk_series = s.id " +
        "                   LEFT JOIN story st " +
        "                   ON        st.fk_issue = i.id " +
        "                   LEFT JOIN story_individual si " +
        "                   ON        si.fk_story = st.id " +
        "                   LEFT JOIN individual iv " +
        "                   ON        iv.id = si.fk_individual " +
        "                   LEFT JOIN story stjoin " +
        "                   ON        stjoin.id = st.fk_parent " +
        "                   LEFT JOIN story_individual sijoin " +
        "                   ON        " + (us ? "sijoin.id = stjoin.fk_story" : "sijoin.fk_story = stjoin.id") +
        "                   LEFT JOIN individual ivjoin " +
        "                   ON        ivjoin.id = sijoin.fk_individual " +
        "                   LEFT JOIN issue ijoin " +
        "                   ON        ijoin.id = stjoin.fk_issue " +
        "                   LEFT JOIN series sjoin " +
        "                   ON        sjoin.id = ijoin.fk_series " +
        "                   LEFT JOIN publisher pjoin " +
        "                   ON        pjoin.id = sjoin.fk_publisher " +
        "                   WHERE     p.original = " + (us ? "1" : "0") +
        "                   " + includeFilter + " " +
        "         ) l1 " +
        " " + where + " " +
        "GROUP BY " + groupby + ";";

    return rawQuery;
}