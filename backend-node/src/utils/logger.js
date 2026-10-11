import pino from 'pino';
import { env } from '../config/env.js';

const isDev = env.NODE_ENV === 'development';
const isTest = env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'college-events-backend',
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
