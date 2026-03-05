import { MarvelCrawlerService } from '../src/services/MarvelCrawlerService';

type SampleIssue = {
  seriesTitle: string;
  volume: number;
  number: string;
};

const SAMPLE_ISSUES: SampleIssue[] = [
  { seriesTitle: 'Avengers', volume: 3, number: '0' },
  { seriesTitle: 'Avengers', volume: 3, number: '1' },
  { seriesTitle: 'Avengers', volume: 3, number: '2' },
  { seriesTitle: 'Avengers', volume: 3, number: '3' },
  { seriesTitle: 'Avengers', volume: 3, number: '4' },
  { seriesTitle: 'Avengers', volume: 3, number: '5' },
  { seriesTitle: 'Avengers', volume: 3, number: '6' },
  { seriesTitle: 'Avengers', volume: 3, number: '7' },
  { seriesTitle: 'Avengers', volume: 3, number: '8' },
  { seriesTitle: 'Avengers', volume: 3, number: '9' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '30' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '31' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '32' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '33' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '34' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '35' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '36' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '37' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '38' },
  { seriesTitle: 'Amazing Spider-Man', volume: 2, number: '39' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '1' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '48' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '49' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '50' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '51' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '52' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '243' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '244' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '245' },
  { seriesTitle: 'Fantastic Four', volume: 1, number: '246' },
  { seriesTitle: 'Daredevil', volume: 1, number: '1' },
  { seriesTitle: 'Daredevil', volume: 1, number: '7' },
  { seriesTitle: 'Daredevil', volume: 1, number: '16' },
  { seriesTitle: 'Daredevil', volume: 1, number: '81' },
  { seriesTitle: 'Daredevil', volume: 1, number: '131' },
  { seriesTitle: 'Daredevil', volume: 1, number: '158' },
  { seriesTitle: 'Daredevil', volume: 1, number: '168' },
  { seriesTitle: 'Daredevil', volume: 1, number: '181' },
  { seriesTitle: 'Daredevil', volume: 1, number: '227' },
  { seriesTitle: 'Daredevil', volume: 1, number: '232' },
  { seriesTitle: 'Iron Man', volume: 1, number: '1' },
  { seriesTitle: 'Iron Man', volume: 1, number: '55' },
  { seriesTitle: 'Iron Man', volume: 1, number: '100' },
  { seriesTitle: 'Iron Man', volume: 1, number: '113' },
  { seriesTitle: 'Iron Man', volume: 1, number: '128' },
  { seriesTitle: 'Iron Man', volume: 1, number: '149' },
  { seriesTitle: 'Iron Man', volume: 1, number: '150' },
  { seriesTitle: 'Iron Man', volume: 1, number: '170' },
  { seriesTitle: 'Iron Man', volume: 1, number: '225' },
  { seriesTitle: 'Iron Man', volume: 1, number: '282' },
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

describe('MarvelCrawlerService live crawl sample (50 issues)', () => {
  it('crawls a fixed sample and prints diagnostics', async () => {
    if (process.env.RUN_MARVEL_CRAWLER_LIVE !== '1') {
      return;
    }

    jest.setTimeout(10 * 60 * 1000);
    const crawler = new MarvelCrawlerService();

    const results = await runWithConcurrency(SAMPLE_ISSUES, async (sample, index) => {
      const label = `${sample.seriesTitle} (Vol. ${sample.volume}) #${sample.number}`;
      try {
        const issue = await crawler.crawlIssue(sample.seriesTitle, sample.volume, sample.number);
        return {
          index: index + 1,
          label,
          ok: true,
          releasedate: issue.releasedate,
          coverUrl: issue.cover?.url || '',
          stories: issue.stories.length,
          individuals: (issue.individuals || []).length,
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
          releasedate: '',
          coverUrl: '',
          stories: 0,
          individuals: 0,
          variants: 0,
          seriesPublisherName: '',
          warning: message,
        };
      }
    });

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    const missingReleaseDate = ok.filter((r) => !r.releasedate).length;
    const missingCover = ok.filter((r) => !r.coverUrl).length;
    const noStories = ok.filter((r) => r.stories === 0).length;
    const noPublisher = ok.filter((r) => !r.seriesPublisherName).length;
    const withVariants = ok.filter((r) => r.variants > 0).length;

    const errorBuckets = failed.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.warning.slice(0, 120);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const report = {
      total: results.length,
      succeeded: ok.length,
      failed: failed.length,
      missingReleaseDate,
      missingCover,
      noStories,
      noPublisher,
      withVariants,
      topErrors: errorBuckets,
    };

    // eslint-disable-next-line no-console
    console.log('[crawler-live-report]', JSON.stringify(report, null, 2));
    // eslint-disable-next-line no-console
    console.log(
      '[crawler-live-sample]',
      JSON.stringify(results.slice(0, 15), null, 2),
    );

    expect(results).toHaveLength(50);
  });
});
