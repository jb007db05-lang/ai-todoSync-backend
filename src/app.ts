import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';

import { Routes } from './interfaces/routes.interface.js';
import errorMiddleware from './middleware/error.middleware.js';
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
    this.port = env.PORT;

    this.initializeMiddlewares();
    this.initializeRoutes(routes);
    this.initializeErrorHandling();
    this.initializeCronJobs();
  }

  private initializeMiddlewares(): void {
    this.app.set('trust proxy', 1);
    this.app.use(helmet());
    this.app.use(
      cors({
        origin: env.ALLOWED_ORIGINS.length ? env.ALLOWED_ORIGINS : true,
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

  private initializeErrorHandling(): void {
    this.app.use(errorMiddleware);
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
