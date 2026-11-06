import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { createTestDependencies } from '../../test/test-dependencies.ts';

describe('GET /health/ready', () => {
  it('returns 200 when the database answers', async () => {
    const app = createApp(createTestDependencies({ checkDatabase: async () => {} }));

    await request(app).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const app = createApp(
      createTestDependencies({
        checkDatabase: async () => {
          throw new Error('connection refused');
        },
      }),
    );

    const res = await request(app).get('/health/ready').expect(503);

    expect(res.body).toEqual({ error: { message: 'Database unavailable' } });
  });
});

describe('GET /health', () => {
  it('stays 200 even when the database is down', async () => {
    const app = createApp(
      createTestDependencies({
        checkDatabase: async () => {
          throw new Error('connection refused');
        },
      }),
    );

    await request(app).get('/health').expect(200, { status: 'ok' });
  });
});
