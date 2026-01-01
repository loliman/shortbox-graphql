"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./core/server");
const boot_1 = require("./boot");
const logger_1 = __importDefault(require("./util/logger"));
(0, boot_1.boot)(async () => {
    const { url } = await (0, server_1.startServer)();
    logger_1.default.info(`🚀 Server is up and running at ${url}`);
});
