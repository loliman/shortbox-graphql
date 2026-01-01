import { BaseCrawler } from './BaseCrawler';
import logger from '../util/logger';
import { crawlIssue as crawlIssueMarvel } from './crawler_marvel';
import { CrawlerIssue } from './types';

export class MarvelCrawler extends BaseCrawler {
  private indexUri: string;
  private apiUri: string;

  constructor() {
    super('https://marvel.fandom.com');
    this.indexUri = `${this.baseUri}/index.php`;
    this.apiUri = `${this.baseUri}/api.php`;
  }

  async crawlIssue(number: string, title: string, volume: number): Promise<CrawlerIssue> {
    logger.info(`MarvelCrawler: Crawling issue ${title} (Vol. ${volume}) #${number}`);
    return await crawlIssueMarvel(number, title, volume);
  }
}
