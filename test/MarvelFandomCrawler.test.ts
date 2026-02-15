import {MarvelFandomCrawler} from '../src/core/crawler/MarvelFandomCrawler';

test('Simple crawler test', async () => {
  let crawler: MarvelFandomCrawler = new MarvelFandomCrawler();
  let issue = await crawler.crawl('17', 'Iron Man', 5);

  console.log(issue);
});
