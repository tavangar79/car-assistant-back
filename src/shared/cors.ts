import type { RequestHandler } from 'express';

export interface CorsSettings {
  /** Exact origins allowed, e.g. `https://app.example.com`. */
  origins: string[];
  /** Also allow `http://localhost:<any port>` and `http://127.0.0.1:<any port>` (dev/test only). */
  allowLocalhost: boolean;
}

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isOriginAllowed(origin: string, settings: CorsSettings): boolean {
  return (
    settings.origins.includes(origin) || (settings.allowLocalhost && LOCALHOST_ORIGIN.test(origin))
  );
}

/**
 * Lets browser apps on allowed origins call the API. Auth uses a Bearer token, not cookies,
 * so credentials are not enabled. Disallowed origins get no CORS headers and the browser blocks them.
 */
export function cors(settings: CorsSettings): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin === undefined) return next();

    res.vary('Origin');
    if (!isOriginAllowed(origin, settings)) return next();

    res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  };
}
