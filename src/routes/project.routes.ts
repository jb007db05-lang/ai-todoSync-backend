import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import projectController from "../controllers/project.controller.js";

class ProjectRoutes implements Routes {
  public path = "/api/projects";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.post("/", projectController.createProject);
    this.router.get("/", projectController.getProjects);
    this.router.post("/bulk-delete", projectController.bulkDeleteProjects);
    this.router.patch("/:id", projectController.updateProject);
    this.router.delete("/:id", projectController.deleteProject);
  }
}

export default ProjectRoutes;
