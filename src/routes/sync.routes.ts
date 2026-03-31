import { Router } from 'express';

import { Routes } from '../interfaces/routes.interface.js';
import syncController from '../controllers/sync.controller.js';
import syncKeyMiddleware from '../middleware/syncKey.middleware.js';

class SyncRoutes implements Routes {
  public path = '/api/sync';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/tasks', syncKeyMiddleware, syncController.fetchTasks);
    this.router.get('/projects', syncKeyMiddleware, syncController.fetchProjects);
    this.router.get('/projects/:projectId/notes', syncKeyMiddleware, syncController.fetchProjectNotes);
    this.router.get('/summary', syncKeyMiddleware, syncController.fetchSummary);
    this.router.get('/notes/:id', syncKeyMiddleware, syncController.fetchNote);
    this.router.post('/', syncKeyMiddleware, syncController.syncTasks);
    this.router.post('/single', syncKeyMiddleware, syncController.syncSingleTask);
    this.router.post('/projects/:projectId/notes', syncKeyMiddleware, syncController.createProjectNote);
    this.router.put('/notes/:id', syncKeyMiddleware, syncController.updateNote);
  }
}

export default SyncRoutes;
