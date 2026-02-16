import { romanize } from './util';

const VALID_ROMAN_PATTERN = /^(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i;

const toSafeString = (value: unknown): string => (value == null ? '' : String(value));

const isOriginalFlag = (value: boolean | number): boolean => value === true || value === 1;

const isUnreservedUrlByte = (byte: number): boolean =>
  (byte >= 48 && byte <= 57) ||
  (byte >= 65 && byte <= 90) ||
  (byte >= 97 && byte <= 122) ||
  byte === 45 ||
  byte === 46 ||
  byte === 95 ||
  byte === 126;

export const sortableTitle = (title: string): string => {
  let label = toSafeString(title).toLowerCase();
  label = label.replace(/der |die |das |the /g, '');
  label = label.replace(/[ä]+/g, 'a');
  label = label.replace(/[ü]+/g, 'u');
  label = label.replace(/[ö]+/g, 'o');
  label = label.replace(/[ß]+/g, 'ss');
  label = label.replace(/[^0-9a-zA-Z]+/g, '');
  return label;
};

export const toRoman = (input: number): string => {
  if (!Number.isFinite(input) || input < 0) return 'overflow';

  const arabic = Math.trunc(input);
  if (arabic > 3999) return 'overflow';
  if (arabic === 0) return 'N';

  const numerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let remaining = arabic;
  let result = '';
  for (const [value, symbol] of numerals) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
};

export const fromRoman = (roman: string): number => {
  const normalized = toSafeString(roman).trim().toUpperCase();
  if (normalized === '') return 0;
  if (!VALID_ROMAN_PATTERN.test(normalized)) return 0;

  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };

  let sum = 0;
  let previous = 0;
  for (let i = normalized.length - 1; i >= 0; i--) {
    const current = values[normalized[i]] || 0;
    if (current === 0) return 0;
    sum += current < previous ? -current : current;
    previous = current;
  }
  return sum;
};

export const urlEncode = (input: string | null | undefined): string | null => {
  if (input == null) return null;

  const bytes = Buffer.from(input, 'utf8');
  let encoded = '';
  for (const byte of bytes) {
    if (isUnreservedUrlByte(byte)) {
      encoded += String.fromCharCode(byte);
    } else {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return encoded;
};

export const createSeriesLabel = (
  title: string,
  name: string,
  volume: number,
  startYear: number,
  _endYear: number,
): string => {
  const publisher = ` (${toSafeString(title)})`;
  const volumeLabel = ` (Vol. ${toRoman(Number(volume))}) `;
  return `${toSafeString(name)}${volumeLabel}${toSafeString(startYear)}${publisher}`;
};

export const createIssueLabel = (
  title: string,
  name: string,
  volume: number,
  startYear: number,
  endYear: number,
  number: string,
  format: string,
  variant: string,
  issueTitle: string,
): string => {
  let label = `${createSeriesLabel(title, name, volume, startYear, endYear)} #${toSafeString(number)}`;
  let formatLabel = ` (${toSafeString(format)}`;
  if (toSafeString(variant) !== '') {
    formatLabel += `/${toSafeString(variant)}`;
  }
  formatLabel += ')';
  label += formatLabel;

  if (toSafeString(issueTitle) !== '') {
    label += `: ${toSafeString(issueTitle)}`;
  }
  return label;
};

export const createLabel = (
  type: string,
  title: string,
  name: string,
  volume: number,
  startYear: number,
  endYear: number,
  number: string,
  format: string,
  variant: string,
  issueTitle: string,
): string => {
  const normalizedType = toSafeString(type).toLowerCase();
  if (normalizedType === 'publisher') return toSafeString(title);
  if (normalizedType === 'series') {
    return createSeriesLabel(title, name, volume, startYear, endYear);
  }
  if (normalizedType === 'issue')
    return createIssueLabel(
      title,
      name,
      volume,
      startYear,
      endYear,
      number,
      format,
      variant,
      issueTitle,
    );
  return '';
};

export const createUrl = (
  type: string,
  original: boolean | number,
  title: string,
  name: string,
  volume: number,
  number: string,
  format: string,
  variant: string,
): string => {
  const encodedTitle = urlEncode(toSafeString(title)) || '';
  const encodedName = urlEncode(toSafeString(name)) || '';
  const encodedNumber = urlEncode(toSafeString(number)) || '';
  const encodedFormat = urlEncode(toSafeString(format)) || '';
  const encodedVariant = urlEncode(toSafeString(variant)) || '';

  let url = isOriginalFlag(original) ? '/us/' : '/de/';
  url += encodedTitle;

  const normalizedType = toSafeString(type).toLowerCase();
  if (normalizedType !== 'publisher') {
    url += `/${encodedName}_Vol_${toSafeString(volume)}`;
    if (normalizedType !== 'series') {
      url += `/${encodedNumber}/${encodedFormat}`;
      if (encodedVariant !== '') {
        url += `_${encodedVariant}`;
      }
    }
  }

  return url;
};

export const createNodeUrl = (
  type: string,
  original: boolean,
  publisherName: string,
  seriesTitle: string,
  seriesVolume: number,
  number: string,
  format: string,
  variant: string,
): string => {
  let url = original ? '/us/' : '/de/';
  url += encodeURIComponent(publisherName);
  if (type !== 'publisher') {
    url += `/${encodeURIComponent(seriesTitle)}_Vol_${seriesVolume}`;
    if (type !== 'series') {
      url += `/${encodeURIComponent(number)}/${encodeURIComponent(format)}`;
      if (variant) {
        url += `_${encodeURIComponent(variant)}`;
      }
    }
  }
  return url;
};

export const createNodeSeriesLabel = (
  seriesTitle: string,
  publisherName: string,
  volume: number,
  startYear: number,
  endYear: number | null,
): string => {
  let years = ` (${startYear}`;
  if (endYear && endYear > startYear) {
    years += `-${endYear}`;
  }
  years += ')';
  return `${seriesTitle} (Vol. ${romanize(volume)})${years} (${publisherName})`;
};

export const createNodeIssueLabel = (
  seriesLabel: string,
  number: string,
  format: string,
  variant: string,
  issueTitle: string,
): string => {
  let label = `${seriesLabel} #${number}`;
  let fmt = ` (${format}`;
  if (variant) {
    fmt += `/${variant}`;
  }
  fmt += ')';
  label += fmt;
  if (issueTitle) {
    label += `: ${issueTitle}`;
  }
  return label;
};
