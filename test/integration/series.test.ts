import {setup} from './setup';
import {closedown} from './closedown';
import {gql} from 'apollo-server';
import {PUBLISHERS} from '../seeds/publisher';
import {SERIES} from '../seeds/series';
import {Series} from '../../src/database/Series';
import {ISSUES} from '../seeds/issue';

let query: any;

beforeAll(async done => {
  query = await setup();
  done();
});

afterAll(async done => {
  await closedown();
  done();
});

const SERIES_TO_TEST = SERIES[1];
const PUBLISHER_TO_TEST = PUBLISHERS[0];

describe('Series', () => {
  describe('Queries', () => {
    test('Fetches all series', async () => {
      const {data} = await query({
        query: SERIES_QUERY,
        variables: {
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
          offset: 0,
        },
      });

      expect(data.series).not.toBeNull();
      const expectedSeries = SERIES.filter(
        series => series.fk_publisher === PUBLISHER_TO_TEST.id
      );
      expect(data.series.length).toEqual(expectedSeries.length);
      expect(
        data.series.map(
          (s: Series) => s.title + ' ' + s.volume + ' ' + s.publisher.id
        )
      ).toEqual(
        expectedSeries.map(
          s => s.title + ' ' + s.volume + ' ' + PUBLISHER_TO_TEST.id
        )
      );
    });

    test('Fetches all series from offset', async () => {
      const offset = 1;
      const {data} = await query({
        query: SERIES_QUERY,
        variables: {
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
          offset: offset,
        },
      });

      expect(data.series).not.toBeNull();
      expect(data.series.length).toEqual(
        SERIES.filter(
          series => series.fk_publisher === PUBLISHER_TO_TEST.id
        ).slice(offset).length
      );
    });

    test('Fetches all series with pattern', async () => {
      const PATTERN = 'er-M';

      const {data} = await query({
        query: SERIES_QUERY,
        variables: {
          pattern: PATTERN,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
          offset: 0,
        },
      });

      expect(data.series).not.toBeNull();

      let expectedSeries: any[] = [];
      [
        (s: any) => s.title.toLowerCase() === PATTERN.toLowerCase(),
        (s: any) => s.title.toLowerCase().startsWith(PATTERN.toLowerCase()),
        (s: any) =>
          s.title.toLowerCase().indexOf(PATTERN.toLowerCase()) > 0 &&
          s.title.toLowerCase().indexOf(PATTERN.toLowerCase()) <
            s.title.length - PATTERN.length,
        (s: any) => s.title.toLowerCase().endsWith(PATTERN.toLowerCase()),
      ].forEach(validate => {
        SERIES.forEach(series => {
          if (
            validate(series) &&
            series.fk_publisher === PUBLISHER_TO_TEST.id &&
            !expectedSeries.includes(series)
          )
            expectedSeries.push(series);
        });
      });

      expect(data.series.length).toEqual(expectedSeries.length);
      expect(data.series.map((s: Series) => s.id)).toEqual(
        expectedSeries.map(s => s.id)
      );
    });

    test('Fetches details for one series', async () => {
      const {data} = await query({
        query: SERIES_DETAILS_QUERY,
        variables: {
          title: SERIES_TO_TEST.title,
          volume: SERIES_TO_TEST.volume,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
        },
      });

      expect(data.seriesd).not.toBeNull();

      let series: any = SERIES.find(
        series =>
          series.title === SERIES_TO_TEST.title &&
          series.volume === SERIES_TO_TEST.volume &&
          series.fk_publisher === PUBLISHER_TO_TEST.id
      );
      if (series) series.publisher = PUBLISHER_TO_TEST;
      data.seriesd.publisher.us = data.seriesd.publisher.us ? 1 : 0;
      data.seriesd.fk_publisher = PUBLISHER_TO_TEST.id;

      expect(data.seriesd).toEqual(series);
    });

    test('Fetches child entities of one series', async () => {
      const {data} = await query({
        query: SERIES_DETAILS_QUERY_CHILDS,
        variables: {
          title: SERIES_TO_TEST.title,
          volume: SERIES_TO_TEST.volume,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
        },
      });

      expect(data.seriesd).not.toBeNull();

      let expectedIssues = ISSUES.filter(
        issue => issue.fk_series === SERIES_TO_TEST.id
      );
      expectedIssues = expectedIssues.sort(
        (a, b) => Date.parse(a.releasedate) - Date.parse(b.releasedate)
      );

      expect(data.seriesd.active).toEqual(
        SERIES_TO_TEST.startyear && !SERIES_TO_TEST.endyear
      );
      expect(data.seriesd.issueCount).toEqual(expectedIssues.length);
      expect(data.seriesd.firstIssue.id).toEqual(expectedIssues[0].id);
      expect(data.seriesd.lastIssue.id).toEqual(
        expectedIssues[expectedIssues.length - 1].id
      );
      expect(data.seriesd.lastEdited.map((issue: any) => issue.id)).toEqual(
        expectedIssues.map(issue => issue.id)
      );
      expect(data.seriesd.issues.map((issue: any) => issue.id)).toEqual(
        expectedIssues.map(issue => issue.id)
      );
    });
  });
});

const SERIES_QUERY = gql`
  query test(
    $pattern: String
    $publisherName: String
    $publisherUs: Boolean
    $offset: Int
  ) {
    series(
      pattern: $pattern
      publisher: {name: $publisherName, us: $publisherUs}
      offset: $offset
    ) {
      id
      title
      volume
      addinfo
      startyear
      endyear
      publisher {
        id
      }
    }
  }
`;

const SERIES_DETAILS_QUERY = gql`
  query(
    $title: String!
    $volume: Int!
    $publisherName: String!
    $publisherUs: Boolean!
  ) {
    seriesd(
      series: {
        title: $title
        volume: $volume
        publisher: {name: $publisherName, us: $publisherUs}
      }
    ) {
      id
      title
      volume
      addinfo
      startyear
      endyear
      publisher {
        id
        name
        us
        addinfo
        startyear
        endyear
      }
    }
  }
`;

const SERIES_DETAILS_QUERY_CHILDS = gql`
  query(
    $title: String!
    $volume: Int!
    $publisherName: String!
    $publisherUs: Boolean!
  ) {
    seriesd(
      series: {
        title: $title
        volume: $volume
        publisher: {name: $publisherName, us: $publisherUs}
      }
    ) {
      id
      issues {
        id
      }
      issueCount
      firstIssue {
        id
      }
      lastIssue {
        id
      }
      active
      lastEdited {
        id
      }
    }
  }
`;
