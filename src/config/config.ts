import dotenv from 'dotenv';
dotenv.config();

export const db = process.env.DB_NAME || 'shortbox';
export const dbUser = process.env.DB_USER || 'shortbox';
export const dbPassword = process.env.DB_PASSWORD || 'xxx';
