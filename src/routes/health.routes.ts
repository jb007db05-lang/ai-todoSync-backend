import { Request, Response, Router } from 'express';

import { Routes } from '../interfaces/routes.interface.js';
import { isDatabaseConnected } from '../config/db.config.js';

class HealthRoutes implements Routes {
  public path = '/health';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get('/', this.healthCheck);
  }

  private healthCheck = (_req: Request, res: Response): Response => {
    const databaseConnected = isDatabaseConnected();

    return res.status(databaseConnected ? 200 : 503).json({
      message: databaseConnected ? 'API is healthy' : 'API is unhealthy',
      data: {
        database: databaseConnected ? 'connected' : 'disconnected'
      }
    });
  };
}

export default HealthRoutes;
