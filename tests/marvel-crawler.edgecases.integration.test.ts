import { MarvelCrawlerService } from '../src/services/MarvelCrawlerService';

type SampleIssue = {
  seriesTitle: string;
  volume: number;
  number: string;
};

const EDGECASE_ISSUES: SampleIssue[] = [
  { seriesTitle: 'Fantastic Four Annual', volume: 1, number: '1' },
  { seriesTitle: 'Amazing Spider-Man Annual', volume: 1, number: '1' },
  { seriesTitle: 'Silver Surfer', volume: 3, number: '50' },
  { seriesTitle: 'What If?', volume: 1, number: '1' },
  { seriesTitle: 'Marvel Team-Up', volume: 1, number: '1' },
  { seriesTitle: 'Marvel Two-in-One', volume: 1, number: '1' },
  { seriesTitle: 'Peter Parker, The Spectacular Spider-Man', volume: 1, number: '1' },
  { seriesTitle: 'Sensational Spider-Man', volume: 1, number: '0' },
  { seriesTitle: 'Wolverine', volume: 2, number: '88' },
  { seriesTitle: 'Wolverine', volume: 3, number: '66' },
  { seriesTitle: 'X-Men', volume: 2, number: '4' },
  { seriesTitle: 'New X-Men', volume: 1, number: '114' },
  { seriesTitle: 'Astonishing X-Men', volume: 3, number: '1' },
  { seriesTitle: 'Uncanny X-Force', volume: 1, number: '1' },
  { seriesTitle: 'Moon Knight', volume: 1, number: '25' },
  { seriesTitle: 'Marvel Preview', volume: 1, number: '4' },
  { seriesTitle: 'Savage Tales', volume: 1, number: '1' },
  { seriesTitle: 'Conan the Barbarian', volume: 1, number: '24' },
  { seriesTitle: 'Howard the Duck', volume: 1, number: '16' },
  { seriesTitle: 'Marvel Graphic Novel', volume: 1, number: '1' },
  { seriesTitle: 'Daredevil', volume: 1, number: '232' },
  { seriesTitle: 'Iron Man', volume: 1, number: '282' },
  { seriesTitle: 'Captain America', volume: 1, number: '193' },
  { seriesTitle: 'Thor', volume: 1, number: '337' },
  { seriesTitle: 'Incredible Hulk', volume: 1, number: '377' },
  { seriesTitle: 'New Mutants', volume: 1, number: '87' },
  { seriesTitle: 'X-Factor', volume: 1, number: '6' },
  { seriesTitle: 'Elektra: Assassin', volume: 1, number: '1' },
  { seriesTitle: 'Civil War', volume: 1, number: '7' },
  { seriesTitle: 'Infinity Gauntlet', volume: 1, number: '6' },
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

const hasResidualContext = (name: string): boolean =>
  /\((?:[^)]*(?:chronology|flashback|recap|reference|referenced|mentioned|deceased|apparent destruction|origin revealed|unnamed|illusion|on-screen|behind the scenes|drawing|statue|impersonates)[^)]*)\)/i.test(
    String(name || ''),
  );

describe('MarvelCrawlerService live crawl edgecases', () => {
  it('crawls a targeted edgecase sample and prints diagnostics', async () => {
    if (process.env.RUN_MARVEL_CRAWLER_LIVE !== '1') {
      return;
    }

    jest.setTimeout(10 * 60 * 1000);
    const crawler = new MarvelCrawlerService();

    const results = await runWithConcurrency(EDGECASE_ISSUES, async (sample, index) => {
      const label = `${sample.seriesTitle} (Vol. ${sample.volume}) #${sample.number}`;
      const startedAt = Date.now();

      try {
        const issue = await crawler.crawlIssue(sample.seriesTitle, sample.volume, sample.number);
        const stories = Array.isArray(issue.stories) ? issue.stories : [];
        const variants = Array.isArray(issue.variants) ? issue.variants : [];
        const residualAppearanceCount = stories.reduce(
          (sum, story) =>
            sum + ((story.appearances || []).filter((appearance) => hasResidualContext(appearance.name)).length || 0),
          0,
        );
        const reprintStoriesWithPayload = stories.filter(
          (story) =>
            story.reprintOf &&
            (((story.individuals || []).length > 0) || ((story.appearances || []).length > 0)),
        ).length;
        const variantMissingArtists = variants.filter(
          (variant) => !variant?.cover?.individuals || variant.cover.individuals.length === 0,
        ).length;

        return {
          index: index + 1,
          label,
          ok: true,
          ms: Date.now() - startedAt,
          releasedate: issue.releasedate,
          coverUrl: issue.cover?.url || '',
          stories: stories.length,
          variants: variants.length,
          seriesPublisherName: issue.series?.publisher?.name || '',
          residualAppearanceCount,
          reprintStoriesWithPayload,
          variantMissingArtists,
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
          residualAppearanceCount: 0,
          reprintStoriesWithPayload: 0,
          variantMissingArtists: 0,
          warning: message,
        };
      }
    });

    const ok = results.filter((entry) => entry.ok);
    const failed = results.filter((entry) => !entry.ok);
    const report = {
      total: results.length,
      succeeded: ok.length,
      failed: failed.length,
      missingReleaseDate: ok.filter((entry) => !entry.releasedate).length,
      missingCover: ok.filter((entry) => !entry.coverUrl).length,
      noStories: ok.filter((entry) => entry.stories === 0).length,
      noPublisher: ok.filter((entry) => !entry.seriesPublisherName).length,
      withVariants: ok.filter((entry) => entry.variants > 0).length,
      totalResidualAppearanceCount: ok.reduce((sum, entry) => sum + entry.residualAppearanceCount, 0),
      totalVariantMissingArtists: ok.reduce((sum, entry) => sum + entry.variantMissingArtists, 0),
      totalReprintStoriesWithPayload: ok.reduce((sum, entry) => sum + entry.reprintStoriesWithPayload, 0),
      slowest: [...ok]
        .sort((left, right) => right.ms - left.ms)
        .slice(0, 10)
        .map((entry) => ({ label: entry.label, ms: entry.ms, variants: entry.variants })),
      topWarnings: [...ok]
        .filter(
          (entry) =>
            entry.residualAppearanceCount > 0 ||
            entry.variantMissingArtists > 0 ||
            entry.reprintStoriesWithPayload > 0,
        )
        .sort(
          (left, right) =>
            right.residualAppearanceCount +
            right.variantMissingArtists +
            right.reprintStoriesWithPayload -
            (left.residualAppearanceCount + left.variantMissingArtists + left.reprintStoriesWithPayload),
        )
        .slice(0, 10)
        .map((entry) => ({
          label: entry.label,
          residualAppearanceCount: entry.residualAppearanceCount,
          variantMissingArtists: entry.variantMissingArtists,
          reprintStoriesWithPayload: entry.reprintStoriesWithPayload,
        })),
      failedEntries: failed.map(({ label, warning, ms }) => ({ label, warning, ms })),
    };

    // eslint-disable-next-line no-console
    console.log('[crawler-live-edgecase-report]', JSON.stringify(report, null, 2));

    expect(results).toHaveLength(EDGECASE_ISSUES.length);
  });
});
