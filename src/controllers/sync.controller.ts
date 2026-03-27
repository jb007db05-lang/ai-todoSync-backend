import { NextFunction, Request, Response } from 'express';

import syncService from '../services/sync.service.js';
import type { IUserDocument } from '../models/user.model.js';

type SyncRequest = Request & { user?: IUserDocument };

class SyncController {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  public syncTasks = async (req: SyncRequest, res: Response, next: NextFunction): Promise<void> => {
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
      next(error);
    }
  };

  public syncSingleTask = async (req: SyncRequest, res: Response, next: NextFunction): Promise<void> => {
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
      next(error);
    }
  };

  private normalizeDate(value: unknown): string {
    if (typeof value === 'string' && SyncController.DATE_REGEX.test(value)) {
      return value;
    }

    return new Date().toISOString().slice(0, 10);
  }
}

export default new SyncController();
