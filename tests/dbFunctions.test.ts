import {
  createIssueLabel,
  createLabel,
  createSeriesLabel,
  createUrl,
  fromRoman,
  sortableTitle,
  toRoman,
  urlEncode,
} from '../src/util/dbFunctions';

describe('dbFunctions', () => {
  describe('roman conversion', () => {
    it('converts arabic to roman with legacy edge behavior', () => {
      expect(toRoman(0)).toBe('N');
      expect(toRoman(1)).toBe('I');
      expect(toRoman(4)).toBe('IV');
      expect(toRoman(2026)).toBe('MMXXVI');
      expect(toRoman(3999)).toBe('MMMCMXCIX');
      expect(toRoman(4000)).toBe('overflow');
      expect(toRoman(-1)).toBe('overflow');
    });

    it('converts roman to arabic and returns 0 for invalid values', () => {
      expect(fromRoman('I')).toBe(1);
      expect(fromRoman('mmxxvi')).toBe(2026);
      expect(fromRoman('MMMCMXCIX')).toBe(3999);
      expect(fromRoman('')).toBe(0);
      expect(fromRoman('INVALID')).toBe(0);
      expect(fromRoman('IC')).toBe(0);
    });

    it('round-trips representative roman numerals', () => {
      const numbers = [1, 9, 44, 99, 2026, 3999];
      numbers.forEach((value) => {
        expect(fromRoman(toRoman(value))).toBe(value);
      });
    });
  });

  describe('label helpers', () => {
    it('builds series and issue labels in legacy sql style', () => {
      expect(createSeriesLabel('Marvel', 'Spider-Man', 1, 1963, 1963)).toBe(
        'Spider-Man (Vol. I) 1963 (Marvel)',
      );

      expect(
        createIssueLabel(
          'Marvel',
          'Spider-Man',
          1,
          1963,
          1963,
          '1',
          'HEFT',
          'B',
          'First Swing',
        ),
      ).toBe('Spider-Man (Vol. I) 1963 (Marvel) #1 (HEFT/B): First Swing');

      expect(
        createIssueLabel('Marvel', 'Spider-Man', 1, 1963, 1963, '1', 'HEFT', '', ''),
      ).toBe('Spider-Man (Vol. I) 1963 (Marvel) #1 (HEFT)');
    });

    it('dispatches createLabel by type', () => {
      expect(createLabel('publisher', 'Marvel', '', 0, 0, 0, '', '', '', '')).toBe('Marvel');
      expect(createLabel('series', 'Marvel', 'Spider-Man', 1, 1963, 1963, '', '', '', '')).toBe(
        'Spider-Man (Vol. I) 1963 (Marvel)',
      );
      expect(
        createLabel('issue', 'Marvel', 'Spider-Man', 1, 1963, 1963, '1', 'HEFT', 'B', 'First Swing'),
      ).toBe('Spider-Man (Vol. I) 1963 (Marvel) #1 (HEFT/B): First Swing');
      expect(createLabel('unknown', 'Marvel', 'Spider-Man', 1, 1963, 1963, '1', 'HEFT', '', '')).toBe(
        '',
      );
    });
  });

  describe('url helpers', () => {
    it('encodes bytes with RFC-style unreserved passthrough', () => {
      expect(urlEncode('AZaz09-._~')).toBe('AZaz09-._~');
      expect(urlEncode('Spider Man')).toBe('Spider%20Man');
      expect(urlEncode('ÄÖÜß')).toBe('%C3%84%C3%96%C3%9C%C3%9F');
      expect(urlEncode(null)).toBeNull();
    });

    it('builds urls for publisher/series/issue', () => {
      expect(createUrl('publisher', 1, 'Marvel Comics', '', 0, '', '', '')).toBe(
        '/us/Marvel%20Comics',
      );
      expect(createUrl('series', 0, 'Panini Deutschland', 'Spider-Man', 2, '', '', '')).toBe(
        '/de/Panini%20Deutschland/Spider-Man_Vol_2',
      );
      expect(createUrl('issue', true, 'Marvel Comics', 'Spider-Man', 2, '1', 'HEFT', 'Ä')).toBe(
        '/us/Marvel%20Comics/Spider-Man_Vol_2/1/HEFT_%C3%84',
      );
    });
  });

  describe('sortableTitle', () => {
    it('normalizes german and english articles plus umlauts', () => {
      expect(sortableTitle('Der Übermensch')).toBe('ubermensch');
      expect(sortableTitle('Die Ärzte')).toBe('arzte');
      expect(sortableTitle('Das große Abenteuer')).toBe('grosseabenteuer');
      expect(sortableTitle('The Amazing Spider-Man!')).toBe('amazingspiderman');
      expect(sortableTitle('  The ß-Story #1  ')).toBe('ssstory1');
    });
  });
});
