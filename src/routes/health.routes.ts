import { Request, Response, Router } from 'express';

import { Routes } from '../interfaces/routes.interface.js';

class HealthRoutes implements Routes {
  public path = '/health';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get('/', this.healthCheck);
  }

  private healthCheck = (_req: Request, res: Response): Response =>
    res.status(200).json({ message: 'API is healthy' });
}

export default HealthRoutes;
