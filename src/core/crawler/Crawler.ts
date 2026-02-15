import {Issue} from '../../database/Issue';

export interface Crawler {
  crawl(number: string, title: string, volume: number): Promise<Issue>;
}
