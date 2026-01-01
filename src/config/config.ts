import dotenv from 'dotenv';
dotenv.config();

export const wwwDir = process.env.WWW_DIR || '/Users/Christian/shortbox-sandbox/shortbox-react/public';
export const coverDir = process.env.COVER_DIR || 'covers';
export const db = process.env.DB_NAME || 'shortbox';
export const dbUser = process.env.DB_USER || 'shortbox';
export const dbPassword = process.env.DB_PASSWORD || 'xxx';