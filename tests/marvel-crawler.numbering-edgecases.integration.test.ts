import { MarvelCrawlerService } from '../src/services/MarvelCrawlerService';

type SampleIssue = {
  seriesTitle: string;
  volume: number;
  number: string;
};

const NUMBERING_EDGECASE_ISSUES: SampleIssue[] = [
  { seriesTitle: 'Wolverine', volume: 2, number: '-1' },
  { seriesTitle: 'X-Men Unlimited', volume: 1, number: '-1' },
  { seriesTitle: 'Amazing Spider-Man', volume: 1, number: '1.1' },
  { seriesTitle: 'Iron Man', volume: 5, number: '1.MU' },
  { seriesTitle: 'Thor', volume: 3, number: '600' },
  { seriesTitle: 'Marvel Point One', volume: 1, number: '1' },
  { seriesTitle: 'Amazing Spider-Man', volume: 1, number: '365' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '600' },
  { seriesTitle: 'Deadpool', volume: 4, number: '1.NOW' },
  { seriesTitle: 'Original Sin', volume: 1, number: '3.1' },
  { seriesTitle: 'Age of Ultron', volume: 1, number: '10AI' },
  { seriesTitle: 'Superior Spider-Man', volume: 1, number: '6AU' },
  { seriesTitle: 'Guardians of the Galaxy', volume: 3, number: '0.1' },
  { seriesTitle: 'Nova', volume: 5, number: '1' },
  { seriesTitle: 'Avengers', volume: 5, number: '34.1' },
  { seriesTitle: 'Uncanny Avengers', volume: 1, number: '8AU' },
  { seriesTitle: 'All-New X-Men', volume: 1, number: '18.NOW' },
  { seriesTitle: 'Amazing Spider-Man', volume: 3, number: '1' },
  { seriesTitle: 'Deadpool', volume: 5, number: '250' },
  { seriesTitle: 'Wolverine', volume: 4, number: '1' },
];

const CONCURRENCY = 4;

const runWithConcurrency = async <T, R>(
  input: T[],
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(input.length);
  let cursor = 0;

  const runNext = async (): Promise<void> => {
    const current = cursor;
    cursor += 1;
    if (current >= input.length) return;
    results[current] = await worker(input[current], current);
    await runNext();
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, input.length) }, () => runNext()));
  return results;
};

describe('MarvelCrawlerService live crawl numbering edgecases', () => {
  it('crawls numbering oddities and prints diagnostics', async () => {
    if (process.env.RUN_MARVEL_CRAWLER_LIVE !== '1') {
      return;
    }

    jest.setTimeout(10 * 60 * 1000);
    const crawler = new MarvelCrawlerService();

    const results = await runWithConcurrency(NUMBERING_EDGECASE_ISSUES, async (sample, index) => {
      const label = `${sample.seriesTitle} (Vol. ${sample.volume}) #${sample.number}`;
      const startedAt = Date.now();

      try {
        const issue = await crawler.crawlIssue(sample.seriesTitle, sample.volume, sample.number);
        return {
          index: index + 1,
          label,
          ok: true,
          ms: Date.now() - startedAt,
          releasedate: issue.releasedate,
          coverUrl: issue.cover?.url || '',
          stories: issue.stories.length,
          variants: Array.isArray(issue.variants) ? issue.variants.length : 0,
          seriesPublisherName: issue.series?.publisher?.name || '',
          warning: '',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          index: index + 1,
          label,
          ok: false,
          ms: Date.now() - startedAt,
          releasedate: '',
          coverUrl: '',
          stories: 0,
          variants: 0,
          seriesPublisherName: '',
          warning: message,
        };
      }
    });

    const ok = results.filter((entry) => entry.ok);
    const failed = results.filter((entry) => !entry.ok);
    const errorBuckets = failed.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.warning.slice(0, 160);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const report = {
      total: results.length,
      succeeded: ok.length,
      failed: failed.length,
      missingReleaseDate: ok.filter((entry) => !entry.releasedate).length,
      missingCover: ok.filter((entry) => !entry.coverUrl).length,
      noStories: ok.filter((entry) => entry.stories === 0).length,
      noPublisher: ok.filter((entry) => !entry.seriesPublisherName).length,
      withVariants: ok.filter((entry) => entry.variants > 0).length,
      slowest: [...ok]
        .sort((left, right) => right.ms - left.ms)
        .slice(0, 10)
        .map((entry) => ({ label: entry.label, ms: entry.ms })),
      topErrors: errorBuckets,
      failedEntries: failed.map(({ label, warning, ms }) => ({ label, warning, ms })),
    };

    // eslint-disable-next-line no-console
    console.log('[crawler-live-numbering-edgecase-report]', JSON.stringify(report, null, 2));

    expect(results).toHaveLength(NUMBERING_EDGECASE_ISSUES.length);
  });
});
