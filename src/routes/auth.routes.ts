import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { Routes } from '../interfaces/routes.interface.js';
import authMiddleware from '../middleware/auth.middleware.js';
import authController from '../controllers/auth.controller.js';

class AuthRoutes implements Routes {
  public path = '/api/auth';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    const tokenLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 5,
      message: { error: 'Too many requests, please try again later.' }
    });

    this.router.post('/register', authController.register);
    this.router.post('/login', authController.login);
    this.router.get('/google', authController.googleRedirect);
    this.router.get('/google/callback', authController.googleCallback);
    this.router.post('/token', tokenLimiter, authController.token);
    this.router.get('/me', authMiddleware, authController.me);
    this.router.patch('/regenerate-sync-key', authMiddleware, authController.regenerateSyncKey);
  }
}

export default AuthRoutes;
