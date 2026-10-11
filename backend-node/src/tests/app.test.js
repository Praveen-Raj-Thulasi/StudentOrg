import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Express Application Integration (Supertest)', () => {
  it('GET /health should return 200 with UP status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
    expect(res.body.data.uptimeSeconds).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/health should return 200 with UP status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
  });

  it('GET /api should return API engine information', async () => {
    const res = await request(app).get('/api');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('CollegeEvents API');
  });

  it('GET /ready should return readiness response with dependency status', async () => {
    const res = await request(app).get('/ready');

    // In unit test without connected mongo, ready will be 503 or 200 depending on mock
    expect([200, 503]).toContain(res.status);
    expect(res.body.timestamp).toBeDefined();
    if (res.status === 200) {
      expect(res.body.data.status).toBe('READY');
    } else {
      expect(res.body.errorCode).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('GET /api/non-existent-endpoint should return 404 with standard envelope', async () => {
    const res = await request(app).get('/api/non-existent-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('NOT_FOUND');
    expect(res.body.message).toContain('Endpoint not found');
    expect(res.body.path).toBe('/api/non-existent-endpoint');
  });

  it('should include security headers via helmet', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('should support CORS preflight and expose required headers', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-expose-headers']).toContain('X-Token-Expiry');
  });
});
