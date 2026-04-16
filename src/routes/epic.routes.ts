import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  isProjectMember,
  requireProjectRole,
} from "../middleware/project-access.middleware.js";
import epicController from "../controllers/epic.controller.js";

class EpicRoutes implements Routes {
  public path = "/api/projects/:projectId/epics";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get("/", isProjectMember, epicController.getEpics);
    this.router.post(
      "/",
      requireProjectRole("ADMIN"),
      epicController.createEpic,
    );
    this.router.patch(
      "/reorder",
      requireProjectRole("ADMIN"),
      epicController.reorderEpics,
    );
    this.router.patch(
      "/:epicId",
      requireProjectRole("ADMIN"),
      epicController.updateEpic,
    );
    this.router.delete(
      "/:epicId",
      requireProjectRole("ADMIN"),
      epicController.deleteEpic,
    );
  }
}

export default EpicRoutes;
