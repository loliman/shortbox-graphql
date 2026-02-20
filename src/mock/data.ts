import { mockPublisherFixture } from './fixtures/publisherMock';
import { mockSeriesFixture } from './fixtures/seriesMock';
import { mockIssueDeFixture } from './fixtures/issueMockDe';
import { mockIssueUsFixture } from './fixtures/issueMockUs';
import { mockLastEditedIssues } from './fixtures/lastEditedIssues';

type NodeItem = {
  type: 'publisher' | 'series' | 'issue';
  label: string;
  url: string;
};

const mockPublisherNames = [
  'All Verlag',
  'Arboris Verlag',
  'Bastei',
  'Blue Ocean',
  'Bocola',
  'Carlsen',
  'Cross Cult',
  'Dino',
  'Egmont Ehapa',
  'Finix Comics',
  'Hachette',
  'Panini - DC, Vertigo & Wildstorm',
  'Panini - Marvel & Icon',
  'Panini - Star Wars & Generation',
  'Panini Manga',
  'Schreiber & Leser',
  'Splitter',
  'Zauberstern Comics',
];

export const mockPublishers = mockPublisherNames.map((name) => ({
  name,
  us: false,
  __typename: 'Publisher',
}));

export const mockSeriesList = [
  {
    title: 'Die Abenteuer von Red Sonja - Gesamtausgabe',
    volume: 1,
    startyear: 2024,
    endyear: 0,
    publisher: { name: 'All Verlag', us: false, __typename: 'Publisher' },
    __typename: 'Series',
  },
  {
    title: 'Marada - Die Wölfin (Gesamtausgabe)',
    volume: 1,
    startyear: 2015,
    endyear: 2015,
    publisher: { name: 'All Verlag', us: false, __typename: 'Publisher' },
    __typename: 'Series',
  },
];

export const mockIssuesList = [
  {
    title: '',
    number: '1',
    comicguideid: 0,
    collected: true,
    cover: null,
    covers: [],
    series: {
      title: 'Die Abenteuer von Red Sonja - Gesamtausgabe',
      volume: 1,
      publisher: { name: 'All Verlag', us: false, __typename: 'Publisher' },
      __typename: 'Series',
    },
    format: null,
    variants: [
      { collected: true, variant: '', __typename: 'Issue' },
      { collected: false, variant: 'Vorzugsausgabe', __typename: 'Issue' },
    ],
    __typename: 'Issue',
  },
  {
    title: '',
    number: '2',
    comicguideid: 0,
    collected: true,
    cover: null,
    covers: [],
    series: {
      title: 'Die Abenteuer von Red Sonja - Gesamtausgabe',
      volume: 1,
      publisher: { name: 'All Verlag', us: false, __typename: 'Publisher' },
      __typename: 'Series',
    },
    format: null,
    variants: [
      { collected: true, variant: '', __typename: 'Issue' },
      { collected: false, variant: 'Vorzugsausgabe', __typename: 'Issue' },
    ],
    __typename: 'Issue',
  },
];

export const mockIndividuals = [{ name: 'Stan Lee' }, { name: 'Steve Ditko' }];
export const mockApps = [{ name: 'Spider-Man', type: 'HERO' }];
export const mockArcs = [{ title: 'Origin', type: 'RUN' }];
export const mockLastEdited = mockLastEditedIssues;

export const matches = (value: string, pattern?: string | null) => {
  const p = (pattern ?? '').trim().toLowerCase();
  if (!p || p === '*') return true;
  return value.toLowerCase().includes(p);
};

export const createConnection = <T>(items: T[]) => {
  const edges = items.map((node, index) => ({ cursor: String(index + 1), node }));
  return {
    edges,
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};

export const getNodes = (pattern?: string | null): NodeItem[] => {
  const publisher = mockPublisherFixture;
  const series = mockSeriesFixture;
  const deIssue = mockIssueDeFixture;

  const nodes: NodeItem[] = [
    { type: 'publisher', label: publisher.name, url: `/de/${publisher.name}` },
    {
      type: 'series',
      label: `${series.title} Vol ${series.volume}`,
      url: `/de/${publisher.name}/${series.title}_Vol_${series.volume}`,
    },
    {
      type: 'issue',
      label: `${series.title} #${deIssue.number}`,
      url: `/de/${publisher.name}/${series.title}_Vol_${series.volume}/${deIssue.number}`,
    },
  ];

  return nodes.filter((node) => matches(node.label, pattern));
};

export const getIssueFixture = (us: boolean) => (us ? mockIssueUsFixture : mockIssueDeFixture);

export const getPublisherFixture = (us: boolean) => ({
  ...mockPublisherFixture,
  us,
});

export const getSeriesFixture = (us: boolean) => ({
  ...mockSeriesFixture,
  publisher: { ...mockSeriesFixture.publisher, us },
});
