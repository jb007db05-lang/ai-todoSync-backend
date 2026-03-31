import { Request, Response } from 'express';

import type { IUserDocument } from '../models/user.model.js';
import type { ProjectPayload } from '../services/project.service.js';
import projectService from '../services/project.service.js';

type AuthenticatedRequest = Request & { user?: IUserDocument };

const getRouteParam = (value: string | string[] | undefined): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return '';
};

class ProjectController {
  public createProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const project = await projectService.createProject(user._id.toString(), req.body as ProjectPayload);

      res.status(201).json({
        message: 'Project created',
        data: { project }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getProjects = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const projects = await projectService.fetchProjects(user._id.toString());

      res.status(200).json({
        message: 'Project list fetched',
        data: { projects }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public updateProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const projectId = getRouteParam(req.params.id);
      const project = await projectService.updateProject(projectId, user._id.toString(), req.body as ProjectPayload);

      res.status(200).json({
        message: 'Project updated',
        data: { project }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public deleteProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const projectId = getRouteParam(req.params.id);
      await projectService.deleteProject(projectId, user._id.toString());

      res.status(200).json({
        message: 'Project deleted',
        data: { projectId }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new ProjectController();
