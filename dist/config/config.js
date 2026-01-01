"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbPassword = exports.dbUser = exports.db = exports.coverDir = exports.wwwDir = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.wwwDir = process.env.WWW_DIR || '/Users/Christian/shortbox-sandbox/shortbox-react/public';
exports.coverDir = process.env.COVER_DIR || 'covers';
exports.db = process.env.DB_NAME || 'shortbox';
exports.dbUser = process.env.DB_USER || 'shortbox';
exports.dbPassword = process.env.DB_PASSWORD || 'Apfelmouse2837!';
