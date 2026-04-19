import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  isProjectMember,
  requireProjectRole,
} from "../middleware/project-access.middleware.js";
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
    this.router.post(
      "/:projectId/leave",
      isProjectMember,
      projectController.leaveProject,
    );
    this.router.get(
      "/:projectId/members",
      isProjectMember,
      projectController.getMembers,
    );
    this.router.post(
      "/:projectId/members",
      requireProjectRole("ADMIN"),
      projectController.addMember,
    );
    this.router.delete(
      "/:projectId/members/:userId",
      requireProjectRole("ADMIN"),
      projectController.removeMember,
    );
    this.router.patch("/:id", isProjectMember, projectController.updateProject);
    this.router.delete(
      "/:id",
      isProjectMember,
      projectController.deleteProject,
    );
  }
}

export default ProjectRoutes;
