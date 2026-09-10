import { Router } from "express";
import { Routes } from "../../interfaces/routes.interface.js";
import { isDatabaseConnected } from "../../config/db.config.js";

class HealthRoutes implements Routes {
  public path = "/health";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}`, (_req, res) => {
      const dbConnected = isDatabaseConnected();
      res.status(200).json({
        status: dbConnected ? "ok" : "degraded",
        database: dbConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
      });
    });
  }
}

export default HealthRoutes;
