import axios from 'axios';
import logger from '../util/logger';
import type { CrawlerIssue } from './types';

type RequestOptions<T = unknown> = {
  uri?: string;
  url?: string;
  method?: string;
  qs?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  transform?: (body: string) => T;
};

export abstract class BaseCrawler {
  protected baseUri: string;

  constructor(baseUri: string) {
    this.baseUri = baseUri;
  }

  protected async request<T = unknown>(options: RequestOptions<T>): Promise<T> {
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
      return response.data as T;
    } catch (error) {
      logger.error(`Crawler request failed: ${options.uri || options.url}`, { error });
      throw error;
    }
  }

  abstract crawlIssue(number: string, title: string, volume: number): Promise<CrawlerIssue>;
}
