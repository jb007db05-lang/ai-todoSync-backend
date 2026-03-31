import { NextFunction, Request, Response } from 'express';

import { findUserBySyncApiKey } from '../repositories/auth.repository.js';
import type { IUserDocument } from '../models/user.model.js';

type SyncRequest = Request & { user?: IUserDocument };

const respondUnauthorized = (res: Response): Response =>
  res.status(401).json({ error: 'Invalid or missing sync API key' });

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
    return firstValue?.trim();
  }

  return undefined;
};

const getAuthorizationToken = (authorizationHeader: string | undefined): string | undefined => {
  if (!authorizationHeader) {
    return undefined;
  }

  const bearerMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch) {
    const token = bearerMatch[1]?.trim();
    return token ? token : undefined;
  }

  return authorizationHeader.trim() || undefined;
};

const syncKeyMiddleware = async (req: SyncRequest, res: Response, next: NextFunction): Promise<void> => {
  const apiKey =
    getHeaderValue(req.headers['x-sync-api-key']) ??
    getHeaderValue(req.headers['x-api-key']) ??
    getAuthorizationToken(getHeaderValue(req.headers.authorization)) ??
    (typeof req.query.apiKey === 'string' ? req.query.apiKey : undefined);

  if (!apiKey) {
    respondUnauthorized(res);
    return;
  }

  const user = await findUserBySyncApiKey(apiKey);

  if (user == null) {
    respondUnauthorized(res);
    return;
  }

  req.user = user;
  next();
};

export default syncKeyMiddleware;
