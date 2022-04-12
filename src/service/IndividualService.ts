import {StringUtils} from '../util/StringUtils';
import {QueryBuilderType, raw} from 'objection';
import {Individual} from '../database/Individual';

export class IndividualService {
  async getIndividuals(
    pattern: string,
    type: string,
    offset: number
  ): Promise<Individual[]> {
    const query = Individual.query()
      .offset(offset)
      .limit(50);

    if (!StringUtils.isEmpty(pattern))
      IndividualService.setPattern(query, pattern);
    else query.orderBy('name');

    return query;
  }

  private static setPattern(
    query: QueryBuilderType<Individual>,
    pattern: string
  ) {
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
