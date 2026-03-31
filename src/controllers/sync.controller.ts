import { Request, Response } from 'express';

import syncService from '../services/sync.service.js';
import taskService from '../services/task.service.js';
import projectService from '../services/project.service.js';
import type { IUserDocument } from '../models/user.model.js';

type SyncRequest = Request & { user?: IUserDocument };

class SyncController {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  public fetchTasks = async (req: SyncRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const tasks = await taskService.fetchTasks(user._id.toString(), req.query?.date);
      const date = this.normalizeDate(req.query?.date);

      res.status(200).json({
        message: 'Task list fetched',
        date,
        tasks
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchProjects = async (req: SyncRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const projects = await projectService.fetchProjects(user._id.toString());

      res.status(200).json({
        message: 'Project list fetched',
        projects
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchSummary = async (req: SyncRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const summary = await taskService.getSummary(user._id.toString(), req.query?.date);
      const date = this.normalizeDate(req.query?.date);

      res.status(200).json({
        message: 'Task summary generated',
        date,
        summary
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public syncTasks = async (req: SyncRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      console.log("Body : ",req.body);
      const tasks = await syncService.syncTasks(user._id.toString(), req.body);
      const date = this.normalizeDate(req.body?.date);

      res.status(201).json({
        message: `${tasks.length} task(s) synced successfully`,
        date,
        synced: tasks.length,
        tasks
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public syncSingleTask = async (req: SyncRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const task = await syncService.syncSingleTask(user._id.toString(), req.body);
      const date = this.normalizeDate(req.body?.date);

      res.status(201).json({
        message: 'Task synced successfully',
        date,
        task
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  private normalizeDate(value: unknown): string {
    if (typeof value === 'string' && SyncController.DATE_REGEX.test(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      const date = value.find(
        (entry): entry is string => typeof entry === 'string' && SyncController.DATE_REGEX.test(entry)
      );

      if (date) {
        return date;
      }
    }

    return new Date().toISOString().slice(0, 10);
  }
}

export default new SyncController();
