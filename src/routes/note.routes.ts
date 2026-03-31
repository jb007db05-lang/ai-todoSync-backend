import { Router } from 'express';

import { Routes } from '../interfaces/routes.interface.js';
import authMiddleware from '../middleware/auth.middleware.js';
import noteController from '../controllers/note.controller.js';

class NoteRoutes implements Routes {
  public path = '/api';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.post('/projects/:projectId/notes', noteController.createNote);
    this.router.get('/projects/:projectId/notes', noteController.getProjectNotes);
    this.router.get('/notes/:id', noteController.getNote);
    this.router.put('/notes/:id', noteController.updateNote);
    this.router.delete('/notes/:id', noteController.deleteNote);
  }
}

export default NoteRoutes;
