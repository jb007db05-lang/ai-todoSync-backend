import http from "http";
import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import { rateLimit } from "express-rate-limit";

import { Routes } from "./interfaces/routes.interface.js";
import logger from "./lib/logger.js";
import env from "./config/env.js";
import { connectDatabase } from "./config/db.config.js";
import { scheduleRolloverJob } from "./utils/rollover.js";
import chatSocketServer from "./socket/chat.socket.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { AppError } from "./utils/app-error.js";

class App {
  public app: Application;
  public server: http.Server;
  public port: number;

  private databaseConnection?: Promise<void>;

  constructor(routes: Routes[]) {
    this.app = express();
    this.server = http.createServer(this.app);
    this.port = env.PORT || 5000;

    this.initializeMiddlewares();
    this.initializeRoutes(routes);
    this.initializeCronJobs();
    this.initializeSocketIO();
  }

  private initializeMiddlewares(): void {
    logger.info(`Allowed Origins : ${env.ALLOWED_ORIGINS}`);
    this.app.set("trust proxy", 1);

    this.app.use((req, _res, next) => {
      logger.info(`Incoming Request: ${req.method} ${req.url}`, {
        headers: {
          "x-sync-api-key": req.headers["x-sync-api-key"] ? "***" : "missing",
          "user-agent": req.headers["user-agent"],
        },
      });
      next();
    });

    this.app.use(
      cors({
        origin: env.ALLOWED_ORIGINS,
        credentials: true,
      }),
    );

    // Global rate limiter: 25 non-preflight requests per second per IP.
    const limiter = rateLimit({
      windowMs: 1000,
      max: 100,
      message:
        "Too many requests from this IP, please try again after a second.",
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method === "OPTIONS",
    });
    this.app.use(limiter);

    this.app.use(helmet());
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

    this.app.use((_req, _res, next) => {
      next(new AppError(404, "Route not found", "NOT_FOUND"));
    });
    this.app.use(errorMiddleware);
  }

  private initializeCronJobs(): void {
    scheduleRolloverJob();
  }

  private initializeSocketIO(): void {
    chatSocketServer.initialize(this.server);
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
      this.server.listen(this.port, () => {
        logger.info(`Server listening on port ${this.port}`);
        logger.info(`Socket.IO server ready for connections`);
      });
    } catch (error) {
      logger.error(
        "Server startup failed",
        error instanceof Error ? error : new Error("Unknown error"),
      );
      throw error;
    }
  }

  public getServer(): Application {
    return this.app;
  }
}

export default App;
