import { Router } from "express";
import type { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import {
  requireWorkspaceAdmin,
  workspaceContext,
} from "../../access/access.middleware.js";
import {
  createWorkspace,
  getMyAccess,
  getPermissionCatalog,
  getWorkspaceDetails,
  inviteMember,
  listMembers,
  listWorkspaces,
  removeMember,
  updateMemberPermissions,
  updateMemberRole,
  updateWorkspace,
} from "../controllers/workspace.controller.js";

class WorkspaceRoutes implements Routes {
  public path = "/api/workspaces";
  public router = Router();

  constructor() {
    const member = [authMiddleware, workspaceContext()];
    const admin = [...member, requireWorkspaceAdmin];

    this.router.get("/", authMiddleware, listWorkspaces);
    this.router.post("/", authMiddleware, createWorkspace);
    this.router.get("/permissions", authMiddleware, getPermissionCatalog);

    this.router.get("/:workspaceId", ...member, getWorkspaceDetails);
    this.router.patch("/:workspaceId", ...admin, updateWorkspace);
    this.router.get("/:workspaceId/me", ...member, getMyAccess);

    this.router.get("/:workspaceId/members", ...member, listMembers);
    this.router.post("/:workspaceId/members", ...admin, inviteMember);
    this.router.patch(
      "/:workspaceId/members/:memberId/permissions",
      ...admin,
      updateMemberPermissions,
    );
    this.router.patch(
      "/:workspaceId/members/:memberId/role",
      ...admin,
      updateMemberRole,
    );
    this.router.delete(
      "/:workspaceId/members/:memberId",
      ...admin,
      removeMember,
    );
  }
}

export default WorkspaceRoutes;
