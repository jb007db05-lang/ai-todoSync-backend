import { Router } from "express";

import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import priorityEngineController from "../../../modules/task/controllers/priority-engine.controller.js";

class PriorityEngineRoutes implements Routes {
  public path = "/api/priority-engine";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.post("/recalculate", priorityEngineController.recalculate);
    this.router.post(
      "/tasks/:taskId/evaluate",
      priorityEngineController.evaluateTask,
    );
  }
}

export default PriorityEngineRoutes;
