import {Publisher} from '../database/Publisher';
import {StringUtils} from '../util/StringUtils';
import {QueryBuilderType, raw} from 'objection';

export class PublisherService {
  async getPublisherDetails(publisher: Publisher): Promise<Publisher> {
    return Publisher.query()
      .where('id', publisher.id)
      .first();
  }

  async getPublishers(
    pattern: string,
    us: boolean,
    offset: number,
    filter: string
  ): Promise<Publisher[]> {
    let query;

    if (!filter)
      query = await PublisherService.getPublishersNoFilter(pattern, us, offset);
    else
      query = await PublisherService.getPublishersWithFilter(
        pattern,
        us,
        offset,
        filter
      );

    return query;
  }

  private static getPublishersNoFilter(
    pattern: string,
    us: boolean,
    offset: number
  ): Promise<Publisher[]> {
    const query = Publisher.query()
      .where('us', us ? 1 : 0)
      .offset(offset)
      .limit(50);

    if (!StringUtils.isEmpty(pattern))
      PublisherService.setPattern(query, pattern);
    else query.orderBy('name');

    return query;
  }

  private static setPattern(
    query: QueryBuilderType<Publisher>,
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

  private static getPublishersWithFilter(
    pattern: string,
    us: boolean,
    offset: number,
    filter: string
  ): Promise<Publisher[]> {
    //TODO
    /*let rawQuery = createFilterQuery(us, filter, offset);
                        let res = await models.sequelize.query(rawQuery);
                        let publishers = [];
                        res[0].forEach(p => publishers.push({
                            name: p.publishername,
                            us: us
                        }));
                        return publishers;*/
    return new Promise<Publisher[]>(() => []);
  }
}
