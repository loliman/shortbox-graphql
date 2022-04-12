import {setup} from './setup';
import {closedown} from './closedown';
import {PUBLISHERS} from '../seeds/publisher';
import {SERIES} from '../seeds/series';
import {ISSUES} from '../seeds/issue';
import {gql} from 'apollo-server';
import {Issue} from '../../src/database/Issue';
import {ISSUE_INDIVIDUAL} from '../seeds/issue_individual';
import {ISSUE_ARC} from '../seeds/issue_arc';

let query: any;

beforeAll(async done => {
  query = await setup();
  done();
});

afterAll(async done => {
  await closedown();
  done();
});

const ISSUE_TO_TEST = ISSUES[0];
const SERIES_TO_TEST = SERIES[1];
const PUBLISHER_TO_TEST = PUBLISHERS[0];

describe('Issue', () => {
  describe('Queries', () => {
    test('Fetches all issues', async () => {
      const {data} = await query({
        query: ISSUES_QUERY,
        variables: {
          seriesTitle: SERIES_TO_TEST.title,
          seriesVolume: SERIES_TO_TEST.volume,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
          offset: 0,
        },
      });

      expect(data.issues).not.toBeNull();
      const expectedIssues = ISSUES.filter(
        issue => issue.fk_series === SERIES_TO_TEST.id && issue.variant === ''
      );
      expect(data.issues.length).toEqual(expectedIssues.length);
      expect(
        data.issues.map(
          (i: Issue) =>
            i.number + ' ' + i.format + ' ' + i.variant + ' ' + i.series.id
        )
      ).toEqual(
        expectedIssues.map(
          i =>
            i.number +
            ' ' +
            i.format +
            ' ' +
            i.variant +
            ' ' +
            SERIES_TO_TEST.id
        )
      );
    });

    test('Fetches all issues from offset', async () => {
      const offset = 1;
      const {data} = await query({
        query: ISSUES_QUERY,
        variables: {
          seriesTitle: SERIES_TO_TEST.title,
          seriesVolume: SERIES_TO_TEST.volume,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
          offset: offset,
        },
      });

      expect(data.issues).not.toBeNull();
      expect(data.issues.length).toEqual(
        ISSUES.filter(
          issue => issue.fk_series === SERIES_TO_TEST.id && issue.variant === ''
        ).slice(offset).length
      );
    });

    test('Fetches child entities of one issue', async () => {
      const {data} = await query({
        query: ISSUE_QUERY_CHILDS,
        variables: {
          number: ISSUE_TO_TEST.number,
          format: ISSUE_TO_TEST.format,
          variant: ISSUE_TO_TEST.variant,
          seriesTitle: SERIES_TO_TEST.title,
          seriesVolume: SERIES_TO_TEST.volume,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
        },
      });

      expect(data.issue).not.toBeNull();

      const expectedIndividuals = ISSUE_INDIVIDUAL.filter(
        individual => individual.fk_issue === data.issue.id
      );
      const expectedArcs = ISSUE_ARC.filter(
        arc => arc.fk_issue === data.issue.id
      );
      expect(data.issue.individuals.length).toEqual(expectedIndividuals.length);
      expect(data.issue.arcs.length).toEqual(expectedArcs.length);
    });

    test('Fetches details for one issue', async () => {
      const {data} = await query({
        query: ISSUE_QUERY,
        variables: {
          number: ISSUE_TO_TEST.number,
          format: ISSUE_TO_TEST.format,
          variant: ISSUE_TO_TEST.variant,
          seriesTitle: SERIES_TO_TEST.title,
          seriesVolume: SERIES_TO_TEST.volume,
          publisherName: PUBLISHER_TO_TEST.name,
          publisherUs: PUBLISHER_TO_TEST.us === 1,
        },
      });

      expect(data.issue).not.toBeNull();

      let issue: any = ISSUES.find(
        issue =>
          issue.number === ISSUE_TO_TEST.number &&
          issue.format === ISSUE_TO_TEST.format &&
          issue.variant === ISSUE_TO_TEST.variant &&
          issue.fk_series === SERIES_TO_TEST.id
      );
      data.issue.fk_series = SERIES_TO_TEST.id;
      data.issue.series.fk_publisher = PUBLISHER_TO_TEST.id;
      data.issue.series.publisher.us = data.issue.series.publisher.us ? 1 : 0;
      issue.series = SERIES_TO_TEST;
      issue.series.publisher = PUBLISHER_TO_TEST;
      expect(data.issue).toEqual(issue);
    });

    /*
    features: [OldFeature]
    stories: [StoryDto]
    covers: [OldCover]
    variants: [OldIssue]
     */
  });
});

const ISSUES_QUERY = gql`
  query test(
    $seriesTitle: String
    $seriesVolume: Int
    $publisherName: String
    $publisherUs: Boolean
    $offset: Int
  ) {
    issues(
      series: {
        title: $seriesTitle
        volume: $seriesVolume
        publisher: {name: $publisherName, us: $publisherUs}
      }
      offset: $offset
    ) {
      id
      number
      format
      variant
      series {
        id
      }
    }
  }
`;

const ISSUE_QUERY = gql`
  query test(
    $number: String!
    $format: String!
    $variant: String
    $seriesTitle: String!
    $seriesVolume: Int!
    $publisherName: String!
    $publisherUs: Boolean!
  ) {
    issue(
      issue: {
        number: $number
        format: $format
        variant: $variant
        series: {
          title: $seriesTitle
          volume: $seriesVolume
          publisher: {name: $publisherName, us: $publisherUs}
        }
      }
    ) {
      id
      title
      number
      format
      variant
      releasedate
      series {
        id
        addinfo
        endyear
        startyear
        title
        volume
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
  }
`;

const ISSUE_QUERY_CHILDS = gql`
  query test(
    $number: String!
    $format: String!
    $variant: String
    $seriesTitle: String!
    $seriesVolume: Int!
    $publisherName: String!
    $publisherUs: Boolean!
  ) {
    issue(
      issue: {
        number: $number
        format: $format
        variant: $variant
        series: {
          title: $seriesTitle
          volume: $seriesVolume
          publisher: {name: $publisherName, us: $publisherUs}
        }
      }
    ) {
      id
      individuals {
        id
      }
      arcs {
        id
      }
    }
  }
`;
