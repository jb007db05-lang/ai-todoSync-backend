import { NextFunction, Request, Response } from 'express';

import { findUserBySyncApiKey } from '../repositories/auth.repository.js';
import type { IUserDocument } from '../models/user.model.js';

type SyncRequest = Request & { user?: IUserDocument };

const respondUnauthorized = (res: Response): Response =>
  res.status(401).json({ error: 'Invalid or missing sync API key' });

const syncKeyMiddleware = async (req: SyncRequest, res: Response, next: NextFunction): Promise<void> => {
  const apiKey =
    typeof req.headers['x-sync-api-key'] === 'string'
      ? req.headers['x-sync-api-key']
      : typeof req.query.apiKey === 'string'
        ? req.query.apiKey
        : undefined;

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
