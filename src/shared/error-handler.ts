import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from './errors.ts';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { message: err.message, details: err.details } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Internal server error' } });
};
