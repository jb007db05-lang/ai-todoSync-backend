import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../utils/app-error.js";
import accessService from "./access.service.js";
import type { PermissionKey } from "./permissions.js";

/** Header the portal sends with the active workspace. */
export const WORKSPACE_HEADER = "x-workspace-id";

const firstString = (value: unknown): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
};

/** Workspace id from the route (`:workspaceId`) or the X-Workspace-Id header. */
export const requestedWorkspaceId = (req: Request): string | undefined =>
  firstString(req.params?.workspaceId) ??
  firstString(req.headers[WORKSPACE_HEADER]);

/**
 * Resolves `req.workspaceAccess` for the signed-in user. Without a workspace
 * in the request, `fallbackToDefault` uses the user's first workspace so older
 * clients (sync API, companion apps) keep working.
 */
export const workspaceContext =
  ({ fallbackToDefault = false }: { fallbackToDefault?: boolean } = {}) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?._id?.toString();
    if (!userId) {
      throw new AppError(401, "Authentication required", "AUTH_REQUIRED");
    }
    const workspaceId = requestedWorkspaceId(req);
    if (!workspaceId && !fallbackToDefault) {
      throw new AppError(
        400,
        "Choose a workspace first.",
        "WORKSPACE_REQUIRED",
      );
    }
    req.workspaceAccess = workspaceId
      ? await accessService.resolve(userId, workspaceId)
      : await accessService.resolveDefault(userId);
    next();
  };

/** 403 unless the member holds every listed permission (admins always pass). */
export const requirePermission =
  (...keys: PermissionKey[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.workspaceAccess) {
      throw new AppError(500, "Workspace context missing", "INTERNAL_ERROR");
    }
    accessService.require(req.workspaceAccess, ...keys);
    next();
  };

/** 403 unless the caller is a workspace owner or admin. */
export const requireWorkspaceAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.workspaceAccess?.isAdmin) {
    throw new AppError(
      403,
      "Only workspace admins can do this.",
      "ADMIN_REQUIRED",
    );
  }
  next();
};

/** The resolved access; use after workspaceContext. */
export const getWorkspaceAccess = (req: Request) => {
  if (!req.workspaceAccess) {
    throw new AppError(500, "Workspace context missing", "INTERNAL_ERROR");
  }
  return req.workspaceAccess;
};
