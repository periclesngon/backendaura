export class ValidationError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.isOperational = true;
  }
}

export class NotFoundError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND_ERROR';
    this.isOperational = true;
  }
}

export class ForbiddenError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.code = 'FORBIDDEN_ERROR';
    this.isOperational = true;
  }
}

export class UnauthorizedError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
    this.code = 'UNAUTHORIZED_ERROR';
    this.isOperational = true;
  }
}

export class ConflictError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
    this.code = 'CONFLICT_ERROR';
    this.isOperational = true;
  }
}

export class InternalServerError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'InternalServerError';
    this.statusCode = 500;
    this.code = 'INTERNAL_SERVER_ERROR';
    this.isOperational = true;
  }
}

// Authentication specific errors
export class AuthenticationError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    this.code = 'AUTHENTICATION_ERROR';
    this.isOperational = true;
  }
}

export class AuthorizationError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    this.code = 'AUTHORIZATION_ERROR';
    this.isOperational = true;
  }
}
