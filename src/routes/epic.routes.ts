import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import epicController from "../controllers/epic.controller.js";

class EpicRoutes implements Routes {
  public path = "/api/projects/:projectId/epics";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.post("/", epicController.createEpic);
    this.router.get("/", epicController.getEpics);
    this.router.patch("/reorder", epicController.reorderEpics);
    this.router.patch("/:epicId", epicController.updateEpic);
    this.router.delete("/:epicId", epicController.deleteEpic);
  }
}

export default EpicRoutes;
