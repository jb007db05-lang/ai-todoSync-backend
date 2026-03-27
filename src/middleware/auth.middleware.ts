import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import env from '../config/env.js';
import UserModel, { IUserDocument } from '../models/user.model.js';

interface JwtPayloadWithUserId extends JwtPayload {
  userId?: string;
}

const respondUnauthorized = (res: Response): Response =>
  res.status(401).json({ error: 'Unauthorized' });

const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    respondUnauthorized(res);
    return;
  }

  const [, token] = authHeader.split(' ');

  if (!token) {
    respondUnauthorized(res);
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayloadWithUserId;
    const userId = typeof decoded.userId === 'string' ? decoded.userId : undefined;

    if (!userId) {
      respondUnauthorized(res);
      return;
    }

    const user = await UserModel.findById(userId).exec();

    if (!user) {
      respondUnauthorized(res);
      return;
    }

    (req as Request & { user: IUserDocument }).user = user;
    next();
  } catch (error) {
    respondUnauthorized(res);
  }
};

export default authMiddleware;
