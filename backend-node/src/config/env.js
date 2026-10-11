import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  APP_BASE_URL: z.string().default('http://localhost:8080'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Primary Database
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required').default('mongodb://localhost:27017/event_booking_db'),

  // JWT Configuration
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default('development-jwt-secret-key-must-be-at-least-32-chars-long'),
  JWT_EXPIRES_IN: z.string().default('30m'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters').default('development-refresh-secret-key-must-be-at-least-32-chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Razorpay
  RAZORPAY_KEY_ID: z.string().optional().default('rzp_test_placeholder_key'),
  RAZORPAY_KEY_SECRET: z.string().optional().default('placeholder_secret_key'),
  RAZORPAY_CURRENCY: z.string().default('INR'),

  // Gemini AI & EventGPT
  AI_PROVIDER: z.string().default('gemini'),
  GEMINI_API_KEY: z.string().optional().default('placeholder_gemini_key'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  EVENTGPT_MAX_HISTORY_MESSAGES: z.coerce.number().default(20),
  EVENTGPT_MAX_CONTEXT_DOCUMENTS: z.coerce.number().default(12),
  VECTOR_DB_PROVIDER: z.string().default('mongodb'),

  // SMTP Mail
  MAIL_HOST: z.string().optional().default('smtp.gmail.com'),
  MAIL_PORT: z.coerce.number().default(587),
  MAIL_USERNAME: z.string().optional(),
  MAIL_PASSWORD: z.string().optional(),
});

/**
 * Validates environment variables against the schema.
 * @param {Object} [customSource] Optional custom environment source for testing
 * @returns {z.infer<typeof envSchema>} Validated environment object
 */
export function validateEnv(customSource = process.env) {
  const result = envSchema.safeParse(customSource);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    const errorMessage = `[FATAL] Environment validation failed:\n${errorDetails}`;

    if (customSource.NODE_ENV === 'test') {
      throw new Error(errorMessage);
    }

    console.error(errorMessage);
    process.exit(1);
  }

  if (result.data.NODE_ENV === 'production') {
    const shortSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET'].filter((key) => result.data[key].length < 32);
    const developmentDefaults = [
      ['JWT_SECRET', 'development-jwt-secret-key-must-be-at-least-32-chars-long'],
      ['JWT_REFRESH_SECRET', 'development-refresh-secret-key-must-be-at-least-32-chars'],
    ].filter(([key, value]) => result.data[key] === value).map(([key]) => key);
    const sameSecrets = result.data.JWT_SECRET === result.data.JWT_REFRESH_SECRET;
    const invalidSecrets = [...new Set([...shortSecrets, ...developmentDefaults])];
    if (invalidSecrets.length > 0 || sameSecrets) {
      const invalid = [...invalidSecrets, ...(sameSecrets ? ['JWT_REFRESH_SECRET (must differ from JWT_SECRET)'] : [])];
      throw new Error(`[FATAL] Production requires separate secrets of at least 32 characters: ${invalid.join(', ')}`);
    }
  }

  return result.data;
}

export const env = validateEnv();
export default env;
