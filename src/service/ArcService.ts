import {StringUtils} from '../util/StringUtils';
import {QueryBuilderType, raw} from 'objection';
import {Arc} from '../database/Arc';

export class ArcService {
  async getArcs(pattern: string, type: string, offset: number): Promise<Arc[]> {
    const query = Arc.query()
      .offset(offset)
      .limit(50);

    if (!StringUtils.isEmpty(type))
      query.where('type', 'like', type.toLocaleUpperCase());

    if (!StringUtils.isEmpty(pattern)) ArcService.setPattern(query, pattern);
    else query.orderBy('name');

    return query;
  }

  private static setPattern(query: QueryBuilderType<Arc>, pattern: string) {
    query.where('name', 'like', '%' + pattern.replace(/\s/g, '%') + '%');
    query.orderBy(
      raw(
        'CASE ' +
          "   WHEN name LIKE '" +
          pattern +
          "' THEN 1 " +
          "   WHEN name LIKE '" +
          pattern +
          "%' THEN 2 " +
          "   WHEN name LIKE '%" +
          pattern +
          "' THEN 4 " +
          '   ELSE 3 END '
      )
    );
  }
}
