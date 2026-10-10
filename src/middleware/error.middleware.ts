import { NextFunction, Request, Response } from "express";

import logger from "../lib/logger.js";
import { isAppError } from "../utils/app-error.js";

const getErrorStatus = (error: unknown): number => {
  if (isAppError(error) && typeof error.status === "number") {
    return error.status;
  }

  return 500;
};

const getErrorCode = (error: unknown, status: number): string => {
  if (
    isAppError(error) &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  if (status === 400) {
    return "BAD_REQUEST";
  }
  if (status === 401) {
    return "UNAUTHORIZED";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }

  return "INTERNAL_ERROR";
};

export const errorMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  // Handle Mongoose CastError gracefully as 400 Bad Request
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: string }).name === "CastError"
  ) {
    logger.warn(
      `CastError for ${req.method} ${req.originalUrl}: ${(error as Error).message}`,
    );
    res.status(400).json({
      success: false,
      message: "Invalid resource identifier.",
      code: "BAD_REQUEST",
    });
    return;
  }

  const status = getErrorStatus(error);
  const rawMessage =
    error instanceof Error && error.message
      ? error.message
      : "Unexpected server error";
  const code = getErrorCode(error, status);

  if (status >= 500) {
    logger.error(
      `Unhandled request error for ${req.method} ${req.originalUrl}`,
      error instanceof Error ? error : new Error(rawMessage),
    );
  }

  // Mask internal server errors from being exposed to the client
  const clientMessage = status >= 500 ? "Internal server error" : rawMessage;

  res.status(status).json({
    success: false,
    message: clientMessage,
    code,
  });
};
