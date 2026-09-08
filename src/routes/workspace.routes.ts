import { Router } from "express";
import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  listWorkspaces,
  createWorkspace,
  getWorkspaceDetails,
  updateWorkspace,
  inviteMember,
  removeMember,
} from "../controllers/workspace.controller.js";

class WorkspaceRoutes implements Routes {
  public path = "/api/workspaces";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get("/", authMiddleware, listWorkspaces);
    this.router.post("/", authMiddleware, createWorkspace);
    this.router.get("/:id", authMiddleware, getWorkspaceDetails);
    this.router.patch("/:id", authMiddleware, updateWorkspace);
    this.router.post("/:id/members", authMiddleware, inviteMember);
    this.router.delete(
      "/:id/members/:memberUserId",
      authMiddleware,
      removeMember,
    );
  }
}

export default WorkspaceRoutes;
