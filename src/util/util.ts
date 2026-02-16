export async function asyncForEach<T>(
  array: T[],
  callback: (item: T, index: number, array: T[]) => Promise<void>,
) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

export function naturalCompare(a: string, b: string) {
  const ax: Array<[string | number, string]> = [];
  const bx: Array<[string | number, string]> = [];

  a.replace(/(\d+)|(\D+)/g, function (_, $1, $2) {
    ax.push([$1 || Infinity, $2 || '']);
    return _;
  });
  b.replace(/(\d+)|(\D+)/g, function (_, $1, $2) {
    bx.push([$1 || Infinity, $2 || '']);
    return _;
  });

  while (ax.length && bx.length) {
    const an = ax.shift()!;
    const bn = bx.shift()!;
    const nn = Number(an[0]) - Number(bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }

  return ax.length - bx.length;
}

export function romanize(num: number) {
  if (isNaN(num)) return NaN;
  var digits = String(+num).split(''),
    key = [
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
    ],
    roman = '',
    i = 3;
  while (i--) roman = (key[+digits.pop()! + i * 10] || '') + roman;
  return Array(+digits.join('') + 1).join('M') + roman;
}

export function escapeSqlString(s: string) {
  return s.replace(/'/g, "''");
}

type LabelPublisher = {
  name?: string | null;
};

type LabelSeries = {
  title?: string | null;
  volume?: number | null;
  startyear?: number | null;
  endyear?: number | null;
  publisher?: LabelPublisher | null;
  getPublisher?: () => Promise<LabelPublisher | null | undefined>;
};

type LabelIssue = {
  number?: string | null;
  format?: string | null;
  variant?: string | null;
  series?: LabelSeries | null;
  getSeries?: () => Promise<LabelSeries | null | undefined>;
};

type LabelItem = LabelPublisher & LabelSeries & LabelIssue;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export async function generateLabel(item: LabelItem | null | undefined): Promise<string> {
  if (!item) return '';

  if (item.name) return item.name;

  if (isNumber(item.volume) && item.volume > 0) {
    let year = '';
    const publisher =
      item.publisher === null || item.publisher
        ? item.publisher
        : item.getPublisher
          ? await item.getPublisher()
          : null;

    if (isNumber(item.startyear))
      if (item.startyear === item.endyear) year = ' (' + item.startyear + ')';
      else {
        year =
          ' (' +
          item.startyear +
          ' - ' +
          (!item.endyear || item.endyear === 0 ? '...' : item.endyear) +
          ')';
      }

    return (
      (item.title || '') +
      ' (Vol. ' +
      romanize(item.volume) +
      ')' +
      year +
      (publisher?.name ? ' (' + publisher.name + ')' : '')
    );
  }

  if (item.number) {
    let year = '';

    const series = item.series ? item.series : item.getSeries ? await item.getSeries() : null;
    if (!series) return '';
    const publisher = series.publisher
      ? series.publisher
      : series.getPublisher
        ? await series.getPublisher()
        : null;

    if (isNumber(series.startyear))
      if (series.startyear === series.endyear) year = ' (' + series.startyear + ')';
      else {
        year =
          ' (' +
          series.startyear +
          ' - ' +
          (!series.endyear || series.endyear === 0 ? '...' : series.endyear) +
          ')';
      }

    let title =
      (series.title || '') +
      ' (' +
      (publisher?.name || '') +
      ') ' +
      (publisher && isNumber(series.volume) ? '(Vol. ' + romanize(series.volume) + ')' : '') +
      year;

    let format = '';
    if ((item.format || '') !== '' || (item.variant || '') !== '') {
      format = ' (';
      if (item.format) format += item.format;
      if (item.format && item.variant) format += '/';
      if (item.variant) format += item.variant;
      format += ')';
    }

    return title + ' #' + item.number + format;
  }

  return '';
}
