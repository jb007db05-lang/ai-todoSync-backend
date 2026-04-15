import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import {
  isProjectMember,
  requireProjectRole,
} from "../middleware/project-access.middleware.js";
import noteController from "../controllers/note.controller.js";

class NoteRoutes implements Routes {
  public path = "/api";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.post(
      "/projects/:projectId/notes",
      requireProjectRole("ADMIN"),
      noteController.createNote,
    );
    this.router.get(
      "/projects/:projectId/notes",
      isProjectMember,
      noteController.getProjectNotes,
    );
    this.router.post(
      "/projects/:projectId/epics/:epicId/notes",
      requireProjectRole("ADMIN"),
      noteController.createEpicNote,
    );
    this.router.get(
      "/projects/:projectId/epics/:epicId/notes",
      isProjectMember,
      noteController.getEpicNotes,
    );
    this.router.get("/notes/:id", noteController.getNote);
    this.router.put("/notes/:id", noteController.updateNote);
    this.router.delete("/notes/:id", noteController.deleteNote);
  }
}

export default NoteRoutes;
