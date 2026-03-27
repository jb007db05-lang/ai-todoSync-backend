import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';

import { Routes } from './interfaces/routes.interface.js';
import logger from './lib/logger.js';
import env from './config/env.js';
import { connectDatabase } from './config/db.config.js';
import { scheduleRolloverJob } from './utils/rollover.js';

class App {
  public app: Application;
  public port: number;

  private databaseConnection?: Promise<void>;

  constructor(routes: Routes[]) {
    this.app = express();
    this.port = env.PORT || 5000;

    this.initializeMiddlewares();
    this.initializeRoutes(routes);
    this.initializeCronJobs();
  }

  private initializeMiddlewares(): void {
    console.log("Allowed Origins : ");
    this.app.set('trust proxy', 1);
    this.app.use(helmet());
    this.app.use(
      cors({
        origin: env.ALLOWED_ORIGINS
        credentials: true
      })
    );
    this.app.use(hpp());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private initializeRoutes(routes: Routes[]): void {
    routes.forEach((route) => {
      if (route.path) {
        this.app.use(route.path, route.router);
        return;
      }

      this.app.use(route.router);
    });
  }

  private initializeCronJobs(): void {
    scheduleRolloverJob();
  }

  private initializeDatabase(): Promise<void> {
    if (!this.databaseConnection) {
      this.databaseConnection = connectDatabase();
    }

    return this.databaseConnection;
  }

  public async listen(): Promise<void> {
    try {
      await this.initializeDatabase();
      this.app.listen(this.port, () => {
        logger.info(`Server listening on port ${this.port}`);
      });
    } catch (error) {
      logger.error('Server startup failed', error instanceof Error ? error : new Error('Unknown error'));
      throw error;
    }
  }

  public getServer(): Application {
    return this.app;
  }
}

export default App;
