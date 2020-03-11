const fetch = require('make-fetch-happen').defaults({cacheManager: './marvel-wiki-cache'});
import * as https from "https";
import {Logger} from "./logger";
import AbortController from "abort-controller";

export const NETWORK_ERROR = "NETWORK_ERROR";

export class Network {
    static lastFetch = 0;
    static fetchCount = 0;

    async fetch(url) {
        return new Promise(async (resolve, reject) => {
            const controller = new AbortController();

            let response;
            let timestamp = new Date().getTime();

            try {
                Logger.log("Fetching " + url, "network");

                const used = process.memoryUsage();
                let debug = "";
                for (let key in used)
                    debug += key + ": " + Math.round(used[key] / 1024 / 1024 * 100) / 100 + "MB, ";
                debug = debug.substr(0, debug.length-2);
                Logger.log(debug, "debug");

                if (Network.fetchCount % 100 === 0 && Network.fetchCount !== 0) {
                    if(timestamp - Network.lastFetch < 15 * 60 * 100)
                        await new Promise(resolve => setTimeout(resolve, 1000));

                    Network.fetchCount = 0;
                }

                response = await fetch(url, {
                    agent: new https.Agent({
                        keepAlive: false
                    }),
                    signal: controller.signal
                });

                let cached = response.headers.get('x-local-cache-key') !== null;

                let r = {
                    status: response.status,
                    redirected: response.redirected,
                    url: response.url,
                    html: await response.text()
                };

                Network.fetchCount++;
                Network.lastFetch = timestamp;

                resolve({response: r, cached: cached});
            } catch (e) {
                let error = {
                    name: NETWORK_ERROR,
                    cause: e
                };

                reject(error);
            } finally {
                controller.abort();
            }
        })
    }
}