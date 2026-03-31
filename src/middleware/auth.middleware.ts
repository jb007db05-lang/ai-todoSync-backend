import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import env from '../config/env.js';
import logger from '../lib/logger.js';
import { findUserById, findUserBySyncApiKey } from '../repositories/auth.repository.js';
import type { IUserDocument } from '../models/user.model.js';

interface JwtPayloadWithUserId extends JwtPayload {
  userId?: string;
}

type AuthenticatedRequest = Request & { user?: IUserDocument };

const respondUnauthorized = (res: Response): Response =>
  res.status(401).json({ error: 'Unauthorized' });

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

const getBearerToken = (authorizationHeader: string | undefined): string | undefined => {
  if (!authorizationHeader) {
    return undefined;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
};

const resolveUserFromJwt = async (token: string): Promise<IUserDocument | null> => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayloadWithUserId;
    const userId = typeof decoded.userId === 'string' ? decoded.userId : undefined;

    if (!userId) {
      return null;
    }

    return await findUserById(userId);
  } catch (error) {
    logger.error('Failed to verify JWT', error instanceof Error ? error : new Error('Invalid JWT token'));
    return null;
  }
};

const resolveUserFromSyncKey = async (req: Request): Promise<IUserDocument | null> => {
  const authorizationHeader = getHeaderValue(req.headers.authorization);
  const apiKey =
    getHeaderValue(req.headers['x-sync-api-key']) ??
    getHeaderValue(req.headers['x-api-key']) ??
    getBearerToken(authorizationHeader) ??
    (typeof req.query.apiKey === 'string' ? req.query.apiKey.trim() : undefined);

  if (!apiKey) {
    return null;
  }

  return findUserBySyncApiKey(apiKey);
};

const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authorizationHeader = getHeaderValue(req.headers.authorization);
  const bearerToken = getBearerToken(authorizationHeader);

  let user = bearerToken ? await resolveUserFromJwt(bearerToken) : null;

  if (user == null) {
    user = await resolveUserFromSyncKey(req);
  }

  if (user == null) {
    respondUnauthorized(res);
    return;
  }

  req.user = user;
  next();
};

export default authMiddleware;
