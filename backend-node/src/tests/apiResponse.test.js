import { describe, it, expect, vi } from 'vitest';
import { ApiResponse } from '../utils/apiResponse.js';

describe('ApiResponse Utility', () => {
  function createMockResponse() {
    const res = {};
    res.statusCode = 200;
    res.status = vi.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    });
    res.json = vi.fn().mockImplementation((payload) => {
      res.body = payload;
      return res;
    });
    return res;
  }

  it('should format successful responses with standard envelope', () => {
    const res = createMockResponse();
    const data = { id: 101, title: 'Hackathon' };

    ApiResponse.success(res, data, 'Event retrieved');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Event retrieved');
    expect(res.body.data).toEqual(data);
    expect(res.body.timestamp).toBeDefined();
  });

  it('should format error responses with standard error envelope', () => {
    const res = createMockResponse();

    ApiResponse.error(res, {
      message: 'Event not found',
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      path: '/api/events/999',
      requestId: 'req-1234',
    });

    expect(res.statusCode).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe(404);
    expect(res.body.message).toBe('Event not found');
    expect(res.body.errorCode).toBe('NOT_FOUND');
    expect(res.body.path).toBe('/api/events/999');
    expect(res.body.requestId).toBe('req-1234');
    expect(res.body.timestamp).toBeDefined();
  });

  it('should format paged responses with Spring Data Page<T> compatible structure', () => {
    const res = createMockResponse();
    const items = [{ id: 1 }, { id: 2 }];

    ApiResponse.paged(res, {
      content: items,
      page: 0,
      size: 10,
      totalElements: 2,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toEqual(items);
    expect(res.body.data.page).toBe(0);
    expect(res.body.data.size).toBe(10);
    expect(res.body.data.totalElements).toBe(2);
    expect(res.body.data.totalPages).toBe(1);
    expect(res.body.data.last).toBe(true);
  });
});
