import {Series} from '../database/Series';
import {Publisher} from '../database/Publisher';
import {Issue} from '../database/Issue';
import {StringUtils} from '../util/StringUtils';

export async function resolveIssue(issue: Issue) {
  const series = await resolveSeries(issue.series);

  const result = await Issue.query()
    .where('number', '=', StringUtils.notUndefined(issue.number))
    .where('format', '=', StringUtils.notUndefined(issue.format))
    .where('variant', '=', StringUtils.notUndefined(issue.variant))
    .where('fk_series', '=', series.id)
    .first();

  if (!result)
    throw new Error(
      'OldIssue ' +
        issue.number +
        ' (' +
        issue.format +
        '/' +
        issue.variant +
        ') in ' +
        ' series with title ' +
        series.title +
        ' Vol. ' +
        series.volume +
        ' with publisher ' +
        series.publisher.name +
        ' not found'
    );

  result.series = series;
  return result;
}

export async function resolveSeries(series: Series): Promise<Series> {
  const publisher = await resolvePublisher(series.publisher);

  const result = await Series.query()
    .where('title', '=', StringUtils.notUndefined(series.title))
    .where('volume', '=', series.volume)
    .where('fk_publisher', '=', publisher.id)
    .first();

  if (!result)
    throw new Error(
      'OldSeries with title ' +
        series.title +
        ' Vol. ' +
        series.volume +
        ' with publisher ' +
        publisher.name +
        ' not found'
    );

  result.publisher = publisher;
  return result;
}

export async function resolvePublisher(
  publisher: Publisher
): Promise<Publisher> {
  const result = await Publisher.query()
    .where('name', StringUtils.notUndefined(publisher.name))
    .where('us', publisher.us ? 1 : 0)
    .first();

  if (!result)
    throw new Error('Publisher with name ' + publisher.name + ' not found');

  return result;
}
