"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFile = exports.storeFile = void 0;
exports.asyncForEach = asyncForEach;
exports.naturalCompare = naturalCompare;
exports.romanize = romanize;
exports.escapeSqlString = escapeSqlString;
exports.generateLabel = generateLabel;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../config/config");
const storeFile = ({ stream, filename, }) => {
    let hash = crypto_1.default
        .createHash('sha256')
        .update(filename + new Date().toLocaleTimeString())
        .digest('hex');
    let path = config_1.wwwDir + '/' + config_1.coverDir + '/' + hash;
    return new Promise((resolve, reject) => stream
        .on('error', (error) => {
        if (stream.truncated)
            fs_1.default.unlinkSync(path);
        reject(error);
    })
        .pipe(fs_1.default.createWriteStream(path))
        .on('error', (error) => reject(error))
        .on('finish', () => resolve({ hash })));
};
exports.storeFile = storeFile;
const deleteFile = (filename) => {
    fs_1.default.unlinkSync(config_1.wwwDir + filename);
};
exports.deleteFile = deleteFile;
async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array);
    }
}
function naturalCompare(a, b) {
    var ax = [], bx = [];
    a.replace(/(\d+)|(\D+)/g, function (_, $1, $2) {
        ax.push([$1 || Infinity, $2 || '']);
        return _;
    });
    b.replace(/(\d+)|(\D+)/g, function (_, $1, $2) {
        bx.push([$1 || Infinity, $2 || '']);
        return _;
    });
    while (ax.length && bx.length) {
        var an = ax.shift();
        var bn = bx.shift();
        var nn = an[0] - bn[0] || an[1].localeCompare(bn[1]);
        if (nn)
            return nn;
    }
    return ax.length - bx.length;
}
function romanize(num) {
    if (isNaN(num))
        return NaN;
    var digits = String(+num).split(''), key = [
        '',
        'C',
        'CC',
        'CCC',
        'CD',
        'D',
        'DC',
        'DCC',
        'DCCC',
        'CM',
        '',
        'X',
        'XX',
        'XXX',
        'XL',
        'L',
        'LX',
        'LXX',
        'LXXX',
        'XC',
        '',
        'I',
        'II',
        'III',
        'IV',
        'V',
        'VI',
        'VII',
        'VIII',
        'IX',
    ], roman = '', i = 3;
    while (i--)
        roman = (key[+digits.pop() + i * 10] || '') + roman;
    return Array(+digits.join('') + 1).join('M') + roman;
}
function escapeSqlString(s) {
    return s.replace("'", '%');
}
async function generateLabel(item) {
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
                year =
                    ' (' +
                        item.startyear +
                        ' - ' +
                        (!item.endyear || item.endyear === 0 ? '...' : item.endyear) +
                        ')';
        return (item.title +
            ' (Vol. ' +
            romanize(item.volume) +
            ')' +
            (year ? year : '') +
            (publisher ? ' (' + publisher.name + ')' : ''));
    }
    if (item.number) {
        let year;
        let series = item.series ? item.series : await item.getSeries();
        let publisher = series.publisher ? series.publisher : await series.getPublisher();
        if (series.startyear)
            if (series.startyear === series.endyear)
                year = ' (' + series.startyear + ')';
            else
                year =
                    ' (' +
                        series.startyear +
                        ' - ' +
                        (!series.endyear || series.endyear === 0 ? '...' : series.endyear) +
                        ')';
        let title = series.title +
            ' (' +
            publisher.name +
            ') ' +
            (publisher ? '(Vol. ' + romanize(series.volume) + ')' : '') +
            (year ? year : '');
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
