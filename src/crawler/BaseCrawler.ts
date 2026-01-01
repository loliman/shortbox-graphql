import axios from 'axios';
import logger from '../util/logger';

export abstract class BaseCrawler {
  protected baseUri: string;

  constructor(baseUri: string) {
    this.baseUri = baseUri;
  }

  protected async request(options: any) {
    try {
      const response = await axios({
        url: options.uri || options.url,
        method: options.method || 'GET',
        params: options.qs,
        data: options.body,
        headers: options.headers,
        transformResponse: options.transform,
        responseType: options.transform ? 'text' : 'json',
      });
      if (options.transform) {
        return options.transform(response.data);
      }
      return response.data;
    } catch (error) {
      logger.error(`Crawler request failed: ${options.uri || options.url}`, { error });
      throw error;
    }
  }

  abstract crawlIssue(number: string, title: string, volume: number): Promise<any>;
}
