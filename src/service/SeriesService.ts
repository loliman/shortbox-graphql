import {Publisher} from '../database/Publisher';
import {StringUtils} from '../util/StringUtils';
import {QueryBuilderType, raw} from 'objection';
import {Series} from '../database/Series';

export class SeriesService {
  async getSeriesDetails(series: Series): Promise<Series> {
    return Series.query()
      .where('id', series.id)
      .first();
  }

  async getSeries(
    pattern: string,
    publisher: Publisher,
    offset: number,
    filter: string
  ): Promise<Series[]> {
    let query;

    if (!filter)
      query = SeriesService.getSeriesNoFilter(pattern, publisher, offset);
    else
      query = SeriesService.getSeriesWithFilter(
        pattern,
        publisher,
        offset,
        filter
      );

    return query;
  }

  private static getSeriesNoFilter(
    pattern: string,
    publisher: Publisher,
    offset: number
  ): Promise<Series[]> {
    const query = Series.query()
      .select('series.*', 'publisher.name', 'publisher.us')
      .leftJoinRelated('publisher')
      .where('us', publisher.us ? 1 : 0)
      .where('name', publisher.name)
      .orderBy(['title', 'volume'])
      .offset(offset)
      .limit(50);

    if (!StringUtils.isEmpty(pattern)) SeriesService.setPattern(query, pattern);

    query.withGraphFetched('publisher');
    return query;
  }

  private static setPattern(query: QueryBuilderType<Series>, pattern: string) {
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

  private static getSeriesWithFilter(
    pattern: string,
    publisher: Publisher,
    offset: number,
    filter: string
  ): Promise<Series[]> {
    //TODO
    /*let rawQuery = createFilterQuery(us, filter, offset);
                            let res = await models.sequelize.query(rawQuery);
                            let publishers = [];
                            res[0].forEach(p => publishers.push({
                                name: p.publishername,
                                us: us
                            }));
                            return publishers;*/
    return new Promise<Series[]>(() => []);
  }
}

/*
if (publisher.name !== "*")
  options.where = {'$OldPublisher.name$': publisher.name};

if (publisher.us !== undefined)
  options.where = {'$OldPublisher.original$': publisher.us ? 1 : 0};

if (pattern !== '') {
  options.where.title = {[Sequelize.Op.like]: '%' + pattern.replace(/\s/g, '%') + '%'};
  options.order = [[models.sequelize.literal("CASE " +
      "   WHEN title LIKE '" + pattern + "' THEN 1 " +
      "   WHEN title LIKE '" + pattern + "%' THEN 2 " +
      "   WHEN title LIKE '%" + pattern + "' THEN 4 " +
      "   ELSE 3 " +
      "END"), 'ASC'], ['volume', 'ASC']];
}

return await models.OldSeries.findAll(options);
 */
