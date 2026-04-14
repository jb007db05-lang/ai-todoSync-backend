import { Request, Response } from "express";

import syncService from "../services/sync.service.js";
import taskService from "../services/task.service.js";
import projectService from "../services/project.service.js";
import epicService from "../services/epic.service.js";
import noteService from "../services/note.service.js";
import type { IUserDocument } from "../models/user.model.js";
import { formatLocalDate } from "../utils/date.js";

type SyncRequest = Request & { user?: IUserDocument };

class SyncController {
  private static readonly DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  public fetchTasks = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const tasks = await taskService.fetchTasks(
        user._id.toString(),
        req.query?.date,
      );
      const date = this.normalizeDate(req.query?.date);

      res.status(200).json({
        message: "Task list fetched",
        date,
        tasks,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchProjects = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projects = await projectService.fetchProjects(user._id.toString());

      res.status(200).json({
        message: "Project list fetched",
        projects,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchSummary = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const summary = await taskService.getSummary(
        user._id.toString(),
        req.query?.date,
      );
      const date = this.normalizeDate(req.query?.date);

      res.status(200).json({
        message: "Task summary generated",
        date,
        summary,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchProjectEpics = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = this.getRouteParam(req.params.projectId);
      const epics = await epicService.fetchProjectEpics(
        user._id.toString(),
        projectId,
      );

      res.status(200).json({
        message: "Epic list fetched",
        epics,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchProjectNotes = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = this.getRouteParam(req.params.projectId);
      const notes = await noteService.fetchProjectNotes(
        user._id.toString(),
        projectId,
      );

      res.status(200).json({
        message: "Project notes fetched",
        notes,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public createProjectNote = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const projectId = this.getRouteParam(req.params.projectId);
      const note = await noteService.createNote(
        user._id.toString(),
        projectId,
        req.body,
      );

      res.status(201).json({
        message: "Note created",
        note,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public fetchNote = async (req: SyncRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const noteId = this.getRouteParam(req.params.id);
      const note = await noteService.fetchNote(user._id.toString(), noteId);

      res.status(200).json({
        message: "Note fetched",
        note,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public updateNote = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const noteId = this.getRouteParam(req.params.id);
      const note = await noteService.updateNote(
        user._id.toString(),
        noteId,
        req.body,
      );

      res.status(200).json({
        message: "Note updated",
        note,
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
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const tasks = await syncService.syncTasks(user._id.toString(), req.body);
      const date = this.normalizeDate(req.body?.date);

      res.status(201).json({
        message: `${tasks.length} task(s) synced successfully`,
        date,
        synced: tasks.length,
        tasks,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public syncSingleTask = async (
    req: SyncRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const task = await syncService.syncSingleTask(
        user._id.toString(),
        req.body,
      );
      const date = this.normalizeDate(req.body?.date);

      res.status(201).json({
        message: "Task synced successfully",
        date,
        task,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  private normalizeDate(value: unknown): string {
    if (typeof value === "string" && SyncController.DATE_REGEX.test(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      const date = value.find(
        (entry): entry is string =>
          typeof entry === "string" && SyncController.DATE_REGEX.test(entry),
      );

      if (date) {
        return date;
      }
    }

    return formatLocalDate();
  }

  private getRouteParam(value: string | string[] | undefined): string {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value[0] ?? "";
    }

    return "";
  }
}

export default new SyncController();
