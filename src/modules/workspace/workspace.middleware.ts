import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../types/auth.js";
import { findWorkspaceById } from "./repositories/workspace.repository.js";
import { findMembership } from "./repositories/workspace-member.repository.js";
import type { WorkspaceRole } from "./models/workspace-member.model.js";
import { AppError } from "../../utils/app-error.js";

/**
 * Resolves the workspaceId from route params.
 * Checks :workspaceId first, then :id (legacy routes).
 */
function resolveWorkspaceId(req: AuthenticatedRequest): string | null {
  const raw =
    (req.params as Record<string, string>).workspaceId ??
    (req.params as Record<string, string>).id ??
    null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Middleware factory that:
 * 1. Resolves the workspaceId from params
 * 2. Loads the workspace document
 * 3. Verifies the authenticated user is a member
 * 4. Optionally restricts to certain roles
 * 5. Attaches req.workspaceAccess = { workspace, member }
 *
 * Must be used AFTER authMiddleware.
 */
export function requireWorkspaceMember(allowedRoles?: WorkspaceRole[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const workspaceId = resolveWorkspaceId(req);
    if (!workspaceId) {
      res.status(400).json({ error: "Workspace ID is required" });
      return;
    }

    try {
      const workspace = await findWorkspaceById(workspaceId);
      if (!workspace) {
        throw new AppError(404, "Workspace not found", "NOT_FOUND");
      }

      const member = await findMembership(workspaceId, userId);
      if (!member) {
        throw new AppError(403, "Access denied to workspace", "FORBIDDEN");
      }

      if (allowedRoles && !allowedRoles.includes(member.role)) {
        throw new AppError(
          403,
          `Role '${member.role}' is insufficient for this action`,
          "FORBIDDEN",
        );
      }

      req.workspaceAccess = { workspace, member };
      next();
    } catch (err: any) {
      res.status(err.status ?? err.statusCode ?? 500).json({
        error: err.message ?? "Internal server error",
      });
    }
  };
}

/** Alias — owner or admin required */
export const requireWorkspaceAdmin = requireWorkspaceMember(["OWNER", "ADMIN"]);

/** Alias — owner only */
export const requireWorkspaceOwner = requireWorkspaceMember(["OWNER"]);
