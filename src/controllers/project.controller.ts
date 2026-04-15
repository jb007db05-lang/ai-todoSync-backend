import { Request, Response } from "express";

import type { IUserDocument } from "../models/user.model.js";
import type { ProjectPayload } from "../services/project.service.js";
import projectService from "../services/project.service.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

const getRouteParam = (value: string | string[] | undefined): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return "";
};

class ProjectController {
  public createProject = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const project = await projectService.createProject(
        user._id.toString(),
        req.body as ProjectPayload,
      );

      res.status(201).json({
        message: "Project created",
        data: { project },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getProjects = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await projectService.fetchProjectsPaginated(
        user._id.toString(),
        page,
        limit,
        search,
      );

      res.status(200).json({
        message: "Project list fetched",
        data: result,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public updateProject = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.id);
      const project = await projectService.updateProject(
        projectId,
        user._id.toString(),
        req.body as ProjectPayload,
      );

      res.status(200).json({
        message: "Project updated",
        data: { project },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public deleteProject = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.id);
      await projectService.deleteProject(projectId, user._id.toString());

      res.status(200).json({
        message: "Project deleted",
        data: { projectId },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public bulkDeleteProjects = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { projectIds } = req.body as { projectIds: string[] };

      if (!Array.isArray(projectIds) || projectIds.length === 0) {
        res.status(400).json({ error: "Project IDs are required" });
        return;
      }

      const deletedCount = await projectService.bulkDeleteProjects(
        user._id.toString(),
        projectIds,
      );

      res.status(200).json({
        message: "Projects deleted",
        data: { deletedCount },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getMembers = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.projectId);
      const members = await projectService.fetchProjectMembers(
        user._id.toString(),
        projectId,
      );

      res.status(200).json({
        message: "Project members fetched",
        data: { members },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public addMember = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.projectId);
      const member = await projectService.addProjectMember(
        user._id.toString(),
        projectId,
        req.body as { userId?: unknown },
      );

      res.status(201).json({
        message: "Project member added",
        data: { member },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public removeMember = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = getRouteParam(req.params.projectId);
      const targetUserId = getRouteParam(req.params.userId);
      await projectService.removeProjectMember(
        user._id.toString(),
        projectId,
        targetUserId,
      );

      res.status(200).json({
        message: "Project member removed",
        data: { userId: targetUserId },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new ProjectController();
