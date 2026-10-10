import type { Request, Response } from "express";
import workspaceService from "../services/workspace.service.js";
import { getWorkspaceAccess } from "../../access/access.middleware.js";

// Errors propagate to the global error middleware (Express 5 forwards
// rejected promises), which maps AppError statuses to responses.

const userIdOf = (req: Request) => req.user!._id.toString();
const param = (req: Request, name: string) => String(req.params[name] ?? "");

export const listWorkspaces = async (req: Request, res: Response) => {
  res.json({
    workspaces: await workspaceService.listUserWorkspaces(userIdOf(req)),
  });
};

export const createWorkspace = async (req: Request, res: Response) => {
  const workspace = await workspaceService.createWorkspace(
    userIdOf(req),
    req.body ?? {},
  );
  res.status(201).json({ workspace });
};

export const getWorkspaceDetails = async (req: Request, res: Response) => {
  res.json({
    workspace: await workspaceService.getWorkspaceDetails(
      getWorkspaceAccess(req),
    ),
  });
};

export const updateWorkspace = async (req: Request, res: Response) => {
  res.json({
    workspace: await workspaceService.updateWorkspace(
      getWorkspaceAccess(req),
      req.body ?? {},
    ),
  });
};

export const getMyAccess = (req: Request, res: Response) => {
  res.json({ access: workspaceService.myAccess(getWorkspaceAccess(req)) });
};

export const getPermissionCatalog = (_req: Request, res: Response) => {
  res.json(workspaceService.permissionCatalog());
};

export const listMembers = async (req: Request, res: Response) => {
  res.json({
    members: await workspaceService.listMembers(getWorkspaceAccess(req)),
  });
};

export const inviteMember = async (req: Request, res: Response) => {
  const member = await workspaceService.inviteMember(
    getWorkspaceAccess(req),
    req.body ?? {},
  );
  res.status(201).json({ member });
};

export const updateMemberPermissions = async (req: Request, res: Response) => {
  const member = await workspaceService.updateMemberPermissions(
    getWorkspaceAccess(req),
    param(req, "memberId"),
    req.body?.permissions,
  );
  res.json({ member });
};

export const updateMemberRole = async (req: Request, res: Response) => {
  const member = await workspaceService.updateMemberRole(
    getWorkspaceAccess(req),
    param(req, "memberId"),
    req.body?.role,
  );
  res.json({ member });
};

export const removeMember = async (req: Request, res: Response) => {
  await workspaceService.removeMember(
    getWorkspaceAccess(req),
    param(req, "memberId"),
  );
  res.json({ message: "Member removed successfully" });
};
