export class Mapper {
  public static map(src: any, dest: any) {
    Object.keys(src).forEach(function(key) {
      if (
        dest[key.toLowerCase()] !== undefined &&
        typeof dest[key.toLowerCase()] !== 'function'
      ) {
        dest[key.toLowerCase()] = src[key];
      }
    });
  }
}
