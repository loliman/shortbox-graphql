export class StringUtils {
  static isEmpty(s: string): boolean {
    return s === undefined || s === null || s.trim().length === 0;
  }

  static notUndefined(s: string | undefined): string {
    if (s === undefined) return '';

    return s;
  }
}
