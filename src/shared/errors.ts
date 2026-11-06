export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, 'Validation failed', details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    public readonly retryAfterSeconds: number,
    extraDetails: Record<string, unknown> = {},
  ) {
    super(429, 'Too many requests', { retryAfterSeconds, ...extraDetails });
    this.name = 'TooManyRequestsError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export const USER_BLOCKED_MESSAGE = 'حساب کاربری شما مسدود شده است. با پشتیبانی تماس بگیرید.';

/** 403 for a user an admin has blocked; the client signs out on `details.code === "user_blocked"`. */
export class UserBlockedError extends AppError {
  constructor() {
    super(403, USER_BLOCKED_MESSAGE, { code: 'user_blocked' });
    this.name = 'UserBlockedError';
  }
}
