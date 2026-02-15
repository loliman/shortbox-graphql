import winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ timestamp, level, message, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    return `${timestamp}${rid} ${level}: ${message} ${
      Object.keys(meta).length ? JSON.stringify(meta) : ''
    }`;
  }),
);

const prodFormat = combine(timestamp(), json());
const LOG_TO_FILES = (process.env.LOG_TO_FILES || 'false').toLowerCase() === 'true';

const transports: winston.transport[] = [new winston.transports.Console()];
if (LOG_TO_FILES) {
  transports.push(new winston.transports.File({ filename: 'error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'combined.log' }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports,
});

export default logger;
