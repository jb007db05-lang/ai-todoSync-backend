import { Request, Response } from 'express';

import type { IUserDocument } from '../models/user.model.js';
import type { ISubtask } from '../models/task.model.js';
import type { CreateTaskPayload, UpdateTaskPayload } from '../repositories/task.repository.js';
import taskService from '../services/task.service.js';

type AuthenticatedRequest = Request & { user?: IUserDocument };

interface CreateTaskRequestBody {
  title?: string;
  description?: string;
  date?: string;
  status?: CreateTaskPayload['status'];
  source?: string;
  projectId?: string | null;
  subtasks?: ISubtask[];
}

const getDateQuery = (req: Request): string | undefined => {
  const { date } = req.query;

  if (typeof date === 'string') {
    return date;
  }

  if (Array.isArray(date)) {
    return date.find((value): value is string => typeof value === 'string');
  }

  return undefined;
};

const getRouteParam = (value: string | string[] | undefined): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return '';
};

class TaskController {
  public getTasks = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const tasks = await taskService.fetchTasks(user._id.toString(), getDateQuery(req));

      res.status(200).json({
        message: 'Task list fetched',
        data: { tasks }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public createTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { title, description, date, status, source, projectId, subtasks } = req.body as CreateTaskRequestBody;
      const payload: CreateTaskPayload = {
        userId: user._id.toString(),
        title: title ?? '',
        description,
        date: date ?? '',
        status,
        source,
        projectId,
        subtasks
      };
      const task = await taskService.createTask(payload);

      res.status(201).json({
        message: 'Task created',
        data: { task }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public updateTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const updates = req.body as UpdateTaskPayload;
      const taskId = getRouteParam(req.params.id);
      const updated = await taskService.updateTask(taskId, user._id.toString(), updates);

      res.status(200).json({
        message: 'Task updated',
        data: { task: updated }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public deleteTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const taskId = getRouteParam(req.params.id);
      await taskService.deleteTask(taskId, user._id.toString());

      res.status(200).json({
        message: 'Task deleted',
        data: { taskId }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public taskSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const summary = await taskService.getSummary(user._id.toString(), getDateQuery(req));

      res.status(200).json({
        message: 'Task summary generated',
        data: { summary }
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new TaskController();
