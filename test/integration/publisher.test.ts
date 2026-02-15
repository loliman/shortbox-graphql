import {gql} from 'apollo-server';
import {Publisher} from '../../src/database/Publisher';
import {PUBLISHERS} from '../seeds/publisher';
import {setup} from './setup';
import {closedown} from './closedown';
import {SERIES} from '../seeds/series';
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

const PUBLISHER_TO_TEST = PUBLISHERS[0];

describe('Publisher', () => {
  describe('Queries', () => {
    test('Fetches all publishers', async () => {
      const {data} = await query({
        query: PUBLISHERS_QUERY,
        variables: {
          us: PUBLISHER_TO_TEST.us === 1,
          offset: 0,
        },
      });

      expect(data.publishers).not.toBeNull();
      const expectedPublishers = PUBLISHERS.filter(
        publisher => publisher.us === PUBLISHER_TO_TEST.us
      );
      expect(data.publishers.length).toEqual(expectedPublishers.length);
      expect(data.publishers.map((p: Publisher) => p.name)).toEqual(
        expectedPublishers.map(p => p.name)
      );
    });

    test('Fetches all us publishers', async () => {
      const {data} = await query({
        query: PUBLISHERS_QUERY,
        variables: {
          us: PUBLISHER_TO_TEST.us !== 1,
          offset: 0,
        },
      });

      expect(data.publishers).not.toBeNull();
      expect(data.publishers.length).toEqual(
        PUBLISHERS.filter(publisher => publisher.us !== PUBLISHER_TO_TEST.us)
          .length
      );
    });

    test('Fetches all publishers from offset', async () => {
      const offset = 1;
      const {data} = await query({
        query: PUBLISHERS_QUERY,
        variables: {
          us: PUBLISHER_TO_TEST.us === 1,
          offset: offset,
        },
      });

      expect(data.publishers).not.toBeNull();
      expect(data.publishers.length).toEqual(
        PUBLISHERS.filter(
          publisher => publisher.us === PUBLISHER_TO_TEST.us
        ).slice(offset).length
      );
    });

    test('Fetches all publishers with pattern', async () => {
      const PATTERN = 'r';

      const {data} = await query({
        query: PUBLISHERS_QUERY,
        variables: {
          us: PUBLISHER_TO_TEST.us === 1,
          offset: 0,
          pattern: PATTERN,
        },
      });

      expect(data.publishers).not.toBeNull();

      let expectedPublishers: any[] = [];
      [
        (p: any) => p.name.toLowerCase() === PATTERN.toLowerCase(),
        (p: any) => p.name.toLowerCase().startsWith(PATTERN.toLowerCase()),
        (p: any) =>
          p.name.toLowerCase().indexOf(PATTERN.toLowerCase()) > 0 &&
          p.name.toLowerCase().indexOf(PATTERN.toLowerCase()) <
            p.name.length - PATTERN.length,
        (p: any) => p.name.toLowerCase().endsWith(PATTERN.toLowerCase()),
      ].forEach(validate => {
        PUBLISHERS.forEach(publisher => {
          if (
            validate(publisher) &&
            publisher.us === PUBLISHER_TO_TEST.us &&
            !expectedPublishers.includes(publisher)
          )
            expectedPublishers.push(publisher);
        });
      });

      expect(data.publishers.length).toEqual(expectedPublishers.length);
      expect(data.publishers.map((p: Publisher) => p.id)).toEqual(
        expectedPublishers.map(p => p.id)
      );
    });

    test('Fetches details for one publisher', async () => {
      const {data} = await query({
        query: PUBLISHER_QUERY,
        variables: {
          name: PUBLISHER_TO_TEST.name,
          us: PUBLISHER_TO_TEST.us === 1,
        },
      });

      expect(data.publisher).not.toBeNull();

      data.publisher.us = data.publisher.us ? 1 : 0;

      expect(data.publisher).toEqual(
        PUBLISHERS.find(publisher => publisher.id === PUBLISHER_TO_TEST.id)
      );
    });

    test('Fetches child entities of one publisher', async () => {
      const {data} = await query({
        query: PUBLISHER_QUERY_CHILDS,
        variables: {
          name: PUBLISHER_TO_TEST.name,
          us: PUBLISHER_TO_TEST.us === 1,
        },
      });

      expect(data.publisher).not.toBeNull();

      const expectedSeries = SERIES.filter(
        series => series.fk_publisher === PUBLISHER_TO_TEST.id
      );

      let expectedIssues = ISSUES.filter(issue =>
        expectedSeries.map(series => series.id).includes(issue.fk_series)
      ).sort((a, b) => Date.parse(a.releasedate) - Date.parse(b.releasedate));

      expect(data.publisher.active).toEqual(
        PUBLISHER_TO_TEST.startyear && !PUBLISHER_TO_TEST.endyear
      );
      expect(data.publisher.seriesCount).toEqual(expectedSeries.length);
      expect(data.publisher.issueCount).toEqual(expectedIssues.length);
      expect(data.publisher.firstIssue.id).toEqual(expectedIssues[0].id);
      expect(data.publisher.lastIssue.id).toEqual(
        expectedIssues[expectedIssues.length - 1].id
      );
      expect(data.publisher.lastEdited.map((issue: any) => issue.id)).toEqual(
        expectedIssues.sort((a, b) => a.id - b.id).map(issue => issue.id)
      );
      expect(data.publisher.series.map((series: any) => series.id)).toEqual(
        expectedSeries.map(series => series.id)
      );
    });
  });
});

const PUBLISHERS_QUERY = gql`
  query test($us: Boolean!, $offset: Int!, $pattern: String) {
    publishers(pattern: $pattern, us: $us, offset: $offset) {
      id
      name
    }
  }
`;

const PUBLISHER_QUERY = gql`
  query test($name: String, $us: Boolean) {
    publisher(publisher: {name: $name, us: $us}) {
      id
      name
      endyear
      startyear
      us
      addinfo
    }
  }
`;

const PUBLISHER_QUERY_CHILDS = gql`
  query test($name: String, $us: Boolean) {
    publisher(publisher: {name: $name, us: $us}) {
      id
      active
      seriesCount
      issueCount
      firstIssue {
        id
      }
      lastIssue {
        id
      }
      lastEdited {
        id
      }
      series {
        id
      }
    }
  }
`;
