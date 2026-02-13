import type {Filter, IndividualInput, IssueInput, PublisherInput, SeriesInput} from "@shortbox/contract";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface PublisherModelMock {
  id: number;
  name: string;
  original: boolean;
  addinfo: string;
  startyear: number;
  endyear: number | null;
}

export interface SeriesModelMock {
  id: number;
  title: string;
  startyear: number;
  endyear: number | null;
  volume: number;
  addinfo: string;
  fk_publisher: number;
}

export interface IssueModelMock {
  id: number;
  title: string;
  number: string;
  format: string;
  variant: string;
  releasedate: string;
  pages: number;
  price: number;
  currency: string;
  verified: boolean;
  collected: boolean;
  comicguideid: string;
  isbn: string;
  limitation: string;
  addinfo: string;
  fk_series: number;
}

export const createIndividualInputMock = (
  overrides: DeepPartial<IndividualInput> = {},
): IndividualInput => ({
  name: "Stan Lee",
  type: ["writer"],
  ...overrides,
});

export const createPublisherInputMock = (
  overrides: DeepPartial<PublisherInput> | null = {},
): PublisherInput => ({
  id: "pub-1",
  name: "Marvel",
  us: true,
  addinfo: "Publisher fixture",
  startyear: 1939,
  endyear: null,
  ...(overrides ?? {}),
});

export const createSeriesInputMock = (
  overrides: DeepPartial<SeriesInput> | null = {},
): SeriesInput => {
  const normalized = overrides ?? {};
  const {publisher: publisherOverrides, ...seriesOverrides} = normalized;

  return {
    id: "series-1",
    title: "Amazing Spider-Man",
    volume: 1,
    startyear: 1963,
    endyear: null,
    addinfo: "Series fixture",
    publisher: createPublisherInputMock(publisherOverrides),
    ...seriesOverrides,
  };
};

export const createIssueInputMock = (
  overrides: DeepPartial<IssueInput> | null = {},
): IssueInput => {
  const normalized = overrides ?? {};
  const {series: seriesOverrides, ...issueOverrides} = normalized;

  return {
    id: "issue-1",
    title: "The Amazing Spider-Man",
    number: "1",
    format: "HEFT",
    variant: "",
    releasedate: "1963-03-01",
    pages: 28,
    price: 0.12,
    currency: "USD",
    isbn: "",
    limitation: "",
    addinfo: "Issue fixture",
    series: createSeriesInputMock(seriesOverrides),
    ...issueOverrides,
  };
};

export const createFilterMock = (overrides: DeepPartial<Filter> = {}): Filter => ({
  us: true,
  withVariants: false,
  formats: ["HEFT"],
  releasedates: [{date: "1963-03-01", compare: ">="}],
  publishers: [createPublisherInputMock({id: undefined})],
  series: [createSeriesInputMock({id: undefined, publisher: undefined})],
  numbers: [{number: "1", compare: ">=", variant: ""}],
  individuals: [createIndividualInputMock()],
  and: true,
  ...overrides,
});

export const createPublisherModelMock = (
  overrides: Partial<PublisherModelMock> = {},
): PublisherModelMock => ({
  id: 1,
  name: "Marvel",
  original: true,
  addinfo: "Publisher fixture",
  startyear: 1939,
  endyear: null,
  ...overrides,
});

export const createSeriesModelMock = (overrides: Partial<SeriesModelMock> = {}): SeriesModelMock => ({
  id: 1,
  title: "Amazing Spider-Man",
  startyear: 1963,
  endyear: null,
  volume: 1,
  addinfo: "Series fixture",
  fk_publisher: 1,
  ...overrides,
});

export const createIssueModelMock = (overrides: Partial<IssueModelMock> = {}): IssueModelMock => ({
  id: 1,
  title: "The Amazing Spider-Man",
  number: "1",
  format: "HEFT",
  variant: "",
  releasedate: "1963-03-01",
  pages: 28,
  price: 0.12,
  currency: "USD",
  verified: true,
  collected: false,
  comicguideid: "cg-1",
  isbn: "",
  limitation: "",
  addinfo: "Issue fixture",
  fk_series: 1,
  ...overrides,
});

export const backendMockDataset = {
  publisherInput: createPublisherInputMock(),
  seriesInput: createSeriesInputMock(),
  issueInput: createIssueInputMock(),
  filter: createFilterMock(),
  publisher: createPublisherModelMock(),
  series: createSeriesModelMock(),
  issue: createIssueModelMock(),
};
