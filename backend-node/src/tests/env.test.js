import { describe, it, expect } from 'vitest';
import { validateEnv } from '../config/env.js';

describe('Environment Configuration Validation', () => {
  it('should successfully validate valid environment configurations', () => {
    const validConfig = {
      NODE_ENV: 'test',
      PORT: '8080',
      MONGODB_URI: 'mongodb://localhost:27017/event_booking_test',
      JWT_SECRET: 'test-secret-key-at-least-16-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
      LOG_LEVEL: 'silent',
    };

    const parsed = validateEnv(validConfig);
    expect(parsed.PORT).toBe(8080);
    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.MONGODB_URI).toBe('mongodb://localhost:27017/event_booking_test');
    expect(parsed.LOG_LEVEL).toBe('silent');
    expect(parsed.JWT_EXPIRES_IN).toBe('30m');
    expect(parsed.JWT_REFRESH_EXPIRES_IN).toBe('7d');
  });

  it('should fail fast when invalid port is provided', () => {
    const invalidConfig = {
      NODE_ENV: 'test',
      PORT: 'invalid-not-a-port',
      MONGODB_URI: 'mongodb://localhost:27017/test',
    };

    expect(() => validateEnv(invalidConfig)).toThrow(/Environment validation failed/);
  });

  it('should fail fast when JWT_SECRET is too short', () => {
    const invalidConfig = {
      NODE_ENV: 'test',
      PORT: '8080',
      MONGODB_URI: 'mongodb://localhost:27017/test',
      JWT_SECRET: 'short',
    };

    expect(() => validateEnv(invalidConfig)).toThrow(/JWT_SECRET must be at least 16 characters/);
  });
});
