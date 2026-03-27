import { NextFunction, Request, Response } from 'express';

import logger from '../lib/logger.js';

interface ErrorResponse {
  error: string;
}

type StatusError = Error & { status?: number };

const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction
): Response<ErrorResponse> => {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const statusError = error as StatusError;
  const status = typeof statusError.status === 'number' ? statusError.status : 500;

  logger.error('Unhandled exception', {
    message,
    stack: error instanceof Error ? error.stack : undefined
  });

  return res.status(status).json({ error: message });
};

export default errorMiddleware;
