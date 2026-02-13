import {
  FilterSchema,
  IssueInputSchema,
  PublisherInputSchema,
  SeriesInputSchema,
} from "../src/types/schemas";
import {
  createFilterMock,
  createIssueInputMock,
  createPublisherInputMock,
  createSeriesInputMock,
} from "./mocks";

describe("test mocks", () => {
  it("builds valid publisher input data", () => {
    const mock = createPublisherInputMock();
    const parsed = PublisherInputSchema.parse(mock);

    expect(parsed.name).toBe("Marvel");
  });

  it("builds valid series input data", () => {
    const mock = createSeriesInputMock();
    const parsed = SeriesInputSchema.parse(mock);

    expect(parsed.title).toBe("Amazing Spider-Man");
  });

  it("builds valid issue input data", () => {
    const mock = createIssueInputMock();
    const parsed = IssueInputSchema.parse(mock);

    expect(parsed.number).toBe("1");
  });

  it("builds valid filter data", () => {
    const mock = createFilterMock();
    const parsed = FilterSchema.parse(mock);

    expect(parsed.us).toBe(true);
  });
});
