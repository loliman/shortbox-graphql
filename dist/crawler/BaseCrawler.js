"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseCrawler = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../util/logger"));
class BaseCrawler {
    constructor(baseUri) {
        this.baseUri = baseUri;
    }
    async request(options) {
        try {
            const response = await (0, axios_1.default)({
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
        }
        catch (error) {
            logger_1.default.error(`Crawler request failed: ${options.uri || options.url}`, { error });
            throw error;
        }
    }
}
exports.BaseCrawler = BaseCrawler;
