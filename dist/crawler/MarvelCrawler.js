"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarvelCrawler = void 0;
const BaseCrawler_1 = require("./BaseCrawler");
const logger_1 = __importDefault(require("../util/logger"));
const crawler_marvel_1 = require("./crawler_marvel");
class MarvelCrawler extends BaseCrawler_1.BaseCrawler {
    constructor() {
        super('https://marvel.fandom.com');
        this.indexUri = `${this.baseUri}/index.php`;
        this.apiUri = `${this.baseUri}/api.php`;
    }
    async crawlIssue(number, title, volume) {
        logger_1.default.info(`MarvelCrawler: Crawling issue ${title} (Vol. ${volume}) #${number}`);
        return await (0, crawler_marvel_1.crawlIssue)(number, title, volume);
    }
}
exports.MarvelCrawler = MarvelCrawler;
