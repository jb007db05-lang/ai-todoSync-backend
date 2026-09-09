import { Router } from "express";

import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import { isProjectMember } from "../../../middleware/project-access.middleware.js";
import epicController from "../../../modules/epic/controllers/epic.controller.js";

class EpicRoutes implements Routes {
  public path = "/api/projects/:projectId/epics";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get("/", isProjectMember, epicController.getEpics);
    this.router.post("/", isProjectMember, epicController.createEpic);
    this.router.patch("/reorder", isProjectMember, epicController.reorderEpics);
    this.router.patch("/:epicId", isProjectMember, epicController.updateEpic);
    this.router.delete("/:epicId", isProjectMember, epicController.deleteEpic);
  }
}

export default EpicRoutes;
