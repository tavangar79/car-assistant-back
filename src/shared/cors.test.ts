import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createTestDependencies } from '../test/test-dependencies.ts';
import { isOriginAllowed } from './cors.ts';

const WEB_APP = 'https://app.example.com';

describe('isOriginAllowed', () => {
  it('allows a configured origin', () => {
    expect(isOriginAllowed(WEB_APP, { origins: [WEB_APP], allowLocalhost: false })).toBe(true);
  });

  it.each(['http://localhost:8080', 'http://127.0.0.1:53211', 'http://localhost'])(
    'allows %s when allowLocalhost is on',
    (origin) => {
      expect(isOriginAllowed(origin, { origins: [], allowLocalhost: true })).toBe(true);
    },
  );

  it.each([
    'http://localhost:8080',
    'https://evil.example.com',
    'http://localhost.evil.com',
    'http://localhost:8080.evil.com',
  ])('rejects %s when only configured origins are allowed', (origin) => {
    expect(isOriginAllowed(origin, { origins: [WEB_APP], allowLocalhost: false })).toBe(false);
  });
});

describe('CORS', () => {
  const app = createApp(
    createTestDependencies({ cors: { origins: [WEB_APP], allowLocalhost: true } }),
  );

  it('sets Access-Control-Allow-Origin for a configured origin', async () => {
    const res = await request(app).get('/health').set('Origin', WEB_APP).expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(WEB_APP);
    expect(res.headers.vary).toMatch(/Origin/);
  });

  it('sets Access-Control-Allow-Origin for a dev localhost origin on any port', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:61234')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:61234');
  });

  it('sends no CORS headers for a disallowed origin', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://evil.example.com')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers a preflight for a JSON POST with an Authorization header', async () => {
    const res = await request(app)
      .options('/api/auth/otp/request')
      .set('Origin', 'http://localhost:8080')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Content-Type/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/);
  });

  it('does not answer a preflight from a disallowed origin', async () => {
    const res = await request(app)
      .options('/api/auth/otp/request')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('allows only configured origins in production mode', async () => {
    const prodApp = createApp(
      createTestDependencies({ cors: { origins: [WEB_APP], allowLocalhost: false } }),
    );

    const res = await request(prodApp).get('/health').set('Origin', 'http://localhost:8080');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
