import { Request, Response } from "express";

import type { IUserDocument } from "../models/user.model.js";
import noteService from "../services/note.service.js";
import type { NotePayload } from "../services/note.service.js";

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

class NoteController {
  public createNote = async (
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
      const note = await noteService.createNote(
        user._id.toString(),
        projectId,
        req.body as NotePayload,
      );

      res.status(201).json({
        message: "Note created",
        data: { note },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getProjectNotes = async (
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
      const notes = await noteService.fetchProjectNotes(
        user._id.toString(),
        projectId,
      );

      res.status(200).json({
        message: "Project notes fetched",
        data: { notes },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public createEpicNote = async (
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
      const epicId = getRouteParam(req.params.epicId);
      const note = await noteService.createEpicNote(
        user._id.toString(),
        projectId,
        epicId,
        req.body as NotePayload,
      );

      res.status(201).json({
        message: "Epic note created",
        data: { note },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getEpicNotes = async (
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
      const epicId = getRouteParam(req.params.epicId);
      const notes = await noteService.fetchEpicNotes(
        user._id.toString(),
        projectId,
        epicId,
      );

      res.status(200).json({
        message: "Epic notes fetched",
        data: { notes },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getNote = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const noteId = getRouteParam(req.params.id);
      const note = await noteService.fetchNote(user._id.toString(), noteId);

      res.status(200).json({
        message: "Note fetched",
        data: { note },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public updateNote = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const noteId = getRouteParam(req.params.id);
      const note = await noteService.updateNote(
        user._id.toString(),
        noteId,
        req.body as NotePayload,
      );

      res.status(200).json({
        message: "Note updated",
        data: { note },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public deleteNote = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const noteId = getRouteParam(req.params.id);
      const deletedNoteId = await noteService.deleteNote(
        user._id.toString(),
        noteId,
      );

      res.status(200).json({
        message: "Note deleted",
        data: { noteId: deletedNoteId },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new NoteController();
