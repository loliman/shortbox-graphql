import { naturalCompare, romanize, escapeSqlString } from '../src/util/util';

describe('Utility Functions Unit Tests', () => {
  describe('naturalCompare', () => {
    it('should correctly compare strings with numbers', () => {
      const issues = ['1', '10', '2', '21', '100'];
      const sorted = issues.sort(naturalCompare);
      expect(sorted).toEqual(['1', '2', '10', '21', '100']);
    });

    it('should correctly compare alphanumeric strings', () => {
      const items = ['Issue 1', 'Issue 10', 'Issue 2'];
      const sorted = items.sort(naturalCompare);
      expect(sorted).toEqual(['Issue 1', 'Issue 2', 'Issue 10']);
    });
  });

  describe('romanize', () => {
    it('should convert numbers to roman numerals', () => {
      expect(romanize(1)).toBe('I');
      expect(romanize(4)).toBe('IV');
      expect(romanize(9)).toBe('IX');
      expect(romanize(10)).toBe('X');
      expect(romanize(40)).toBe('XL');
      expect(romanize(90)).toBe('XC');
      expect(romanize(100)).toBe('C');
      expect(romanize(400)).toBe('CD');
      expect(romanize(500)).toBe('D');
      expect(romanize(900)).toBe('CM');
      expect(romanize(1000)).toBe('M');
      expect(romanize(2023)).toBe('MMXXIII');
    });
  });

  describe('escapeSqlString', () => {
    it('should replace single quotes with percent sign', () => {
      expect(escapeSqlString("Spider-Man's")).toBe('Spider-Man%s');
    });
  });
});
