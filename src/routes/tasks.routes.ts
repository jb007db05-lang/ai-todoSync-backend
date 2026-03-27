import { Router } from 'express';

import { Routes } from '../interfaces/routes.interface.js';
import authMiddleware from '../middleware/auth.middleware.js';
import taskController from '../controllers/task.controller.js';

class TaskRoutes implements Routes {
  public path = '/api/tasks';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.get('/', taskController.getTasks);
    this.router.post('/', taskController.createTask);
    this.router.patch('/:id', taskController.updateTask);
    this.router.delete('/:id', taskController.deleteTask);
    this.router.get('/summary', taskController.taskSummary);
  }
}

export default TaskRoutes;
