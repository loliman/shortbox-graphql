import {StringUtils} from '../util/StringUtils';
import {Appearance} from '../database/Appearance';
import {QueryBuilderType, raw} from 'objection';

export class AppearanceService {
  async getAppearances(
    pattern: string,
    type: string,
    offset: number
  ): Promise<Appearance[]> {
    const query = Appearance.query()
      .offset(offset)
      .limit(50);

    if (!StringUtils.isEmpty(type))
      query.where('type', 'like', type.toLocaleUpperCase());

    if (!StringUtils.isEmpty(pattern))
      AppearanceService.setPattern(query, pattern);
    else query.orderBy('title');

    return query;
  }

  private static setPattern(
    query: QueryBuilderType<Appearance>,
    pattern: string
  ) {
    query.where('title', 'like', '%' + pattern.replace(/\s/g, '%') + '%');
    query.orderBy(
      raw(
        'CASE ' +
          "   WHEN title LIKE '" +
          pattern +
          "' THEN 1 " +
          "   WHEN title LIKE '" +
          pattern +
          "%' THEN 2 " +
          "   WHEN title LIKE '%" +
          pattern +
          "' THEN 4 " +
          '   ELSE 3 END '
      )
    );
  }
}
