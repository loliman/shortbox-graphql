import crypto from "crypto";
import fs from "fs";
import {coverDir, wwwDir} from "../config/config";

export const storeFile = ({stream, filename}) => {
    let hash = crypto.createHash('sha256')
        .update(filename + new Date().toLocaleTimeString())
        .digest('hex');
    let path = wwwDir + '/' + coverDir + '/' + hash;

    return new Promise((resolve, reject) =>
        stream
            .on('error', error => {
                if (stream.truncated)
                    fs.unlinkSync(path);
                reject(error)
            })
            .pipe(fs.createWriteStream(path))
            .on('error', error => reject(error))
            .on('finish', () => resolve({hash}))
    )
};

export const deleteFile = (filename) => {
    fs.unlinkSync(wwwDir + filename);
};

export async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}

export function naturalCompare(a, b) {
    var ax = [], bx = [];

    a.replace(/(\d+)|(\D+)/g, function(_, $1, $2) { ax.push([$1 || Infinity, $2 || ""]) });
    b.replace(/(\d+)|(\D+)/g, function(_, $1, $2) { bx.push([$1 || Infinity, $2 || ""]) });

    while(ax.length && bx.length) {
        var an = ax.shift();
        var bn = bx.shift();
        var nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
        if(nn) return nn;
    }

    return ax.length - bx.length;
}

export function romanize(num) {
    if (isNaN(num))
        return NaN;
    var digits = String(+num).split(""),
        key = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM",
            "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC",
            "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"],
        roman = "",
        i = 3;
    while (i--)
        roman = (key[+digits.pop() + (i * 10)] || "") + roman;
    return Array(+digits.join("") + 1).join("M") + roman;
}

export function escapeSqlString(s) {
    return s.replace("'", '%');
}

export async function generateLabel(item) {
    if (!item)
        return '';

    if (item.name)
        return item.name;

    if (item.volume) {
        let year;
        let publisher = item.publisher === null || item.publisher ? item.publisher : await item.getPublisher();

        if (item.startyear)
            if (item.startyear === item.endyear)
                year = ' (' + item.startyear + ')';
            else
                year = ' (' + item.startyear + ' - ' + ((!item.endyear || item.endyear === 0) ? '...' : item.endyear) + ')';

        return item.title + ' (Vol. ' + romanize(item.volume) + ')' + (year ? year : "") + (publisher ? ' (' + publisher.name + ')' : '');
    }

    if (item.number) {
        let year;

        let series = item.series ? item.series : await item.getSeries();
        let publisher = series.publisher ? series.publisher : await series.getPublisher();

        if (series.startyear)
            if (series.startyear === series.endyear)
                year = ' (' + series.startyear + ')';
            else
                year = ' (' + series.startyear + ' - ' + ((!series.endyear || series.endyear === 0) ? '...' : series.endyear) + ')';

        let title = series.title + ' (' + publisher.name + ') ' + (publisher ? '(Vol. ' + romanize(series.volume) + ')' : '') + (year ? year : "");

        let format = '';
        if (item.format !== '' || item.variant != '') {
            format = ' (';
            if (item.format !== '')
                format += item.format;
            if (item.format !== '' && item.variant !== '')
                format += '/';
            if (item.variant !== '')
                format += item.variant;
            format += ')';
        }

        return title + ' #' + item.number + format;
    }
}

export function generateMarvelDbSeriesUrl(series) {
    let seriesTitle = series.title.replace(new RegExp(" ", 'g'), "_");
    let url = "https://marvel.fandom.com/wiki/" + seriesTitle + "_Vol_" + series.volume;
    return url.replace(new RegExp(" ", 'g'), "_");
}

export function generateMarvelDbIssueUrl(issue) {
    let seriesTitle = issue.series.title.replace(new RegExp(" ", 'g'), "_");
    let url = "https://marvel.fandom.com/wiki/" + seriesTitle + "_Vol_" + issue.series.volume + "_" + issue.number;
    return url.replace(new RegExp(" ", 'g'), "_");
}
