import { NextFunction, Request, Response } from "express";

import syncService from "../services/sync.service.js";
import taskService from "../services/task.service.js";
import projectService from "../services/project.service.js";
import epicService from "../services/epic.service.js";
import noteService from "../services/note.service.js";
import syncCrudService from "../services/sync-crud.service.js";
import type { IUserDocument } from "../models/user.model.js";
import { formatLocalDate } from "../utils/date.js";
import { AppError } from "../utils/app-error.js";

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

  public listEntity = async (
    req: SyncRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = this.requireUser(req.user);
      const entity = this.getRouteParam(req.params.entity);

      if (!syncCrudService.isSupportedEntity(entity)) {
        throw new AppError(
          404,
          "Sync entity not found",
          "SYNC_ENTITY_NOT_FOUND",
        );
      }

      let result;

      if (entity === "projects") {
        result = await syncCrudService.listProjects(
          user._id.toString(),
          req.query,
        );
      } else if (entity === "epics") {
        result = await syncCrudService.listEpics(
          user._id.toString(),
          req.query,
          typeof req.query.projectId === "string"
            ? req.query.projectId
            : undefined,
        );
      } else if (entity === "tasks") {
        result = await syncCrudService.listTasks(
          user._id.toString(),
          req.query,
          req.query,
        );
      } else {
        result = await syncCrudService.listNotes(
          user._id.toString(),
          req.query,
          req.query,
        );
      }

      const aliases: Record<string, unknown> = {};

      if (entity === "projects") {
        aliases.projects = result.data;
      } else if (entity === "epics") {
        aliases.epics = result.data;
      } else if (entity === "tasks") {
        aliases.tasks = result.data;
        aliases.date = this.normalizeDate(req.query?.date);
      } else if (entity === "notes") {
        aliases.notes = result.data;
      }

      res.status(200).json({
        ...result,
        ...aliases,
      });
    } catch (error) {
      next(error);
    }
  };

  public createEntity = async (
    req: SyncRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = this.requireUser(req.user);
      const entity = this.getRouteParam(req.params.entity);

      if (!syncCrudService.isSupportedEntity(entity)) {
        throw new AppError(
          404,
          "Sync entity not found",
          "SYNC_ENTITY_NOT_FOUND",
        );
      }

      let data;

      if (entity === "projects") {
        data = await syncCrudService.createProject(
          user._id.toString(),
          req.body,
        );
      } else if (entity === "epics") {
        data = await syncCrudService.createEpic(user._id.toString(), req.body);
      } else if (entity === "tasks") {
        data = await syncCrudService.createTask(user._id.toString(), req.body);
      } else {
        data = await syncCrudService.createNote(user._id.toString(), req.body);
      }

      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public getEntity = async (
    req: SyncRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = this.requireUser(req.user);
      const entity = this.getRouteParam(req.params.entity);
      const id = this.getRouteParam(req.params.id);

      if (!syncCrudService.isSupportedEntity(entity)) {
        throw new AppError(
          404,
          "Sync entity not found",
          "SYNC_ENTITY_NOT_FOUND",
        );
      }

      let data;

      if (entity === "projects") {
        data = await syncCrudService.getProject(user._id.toString(), id);
      } else if (entity === "epics") {
        data = await syncCrudService.getEpic(user._id.toString(), id);
      } else if (entity === "tasks") {
        data = await syncCrudService.getTask(user._id.toString(), id);
      } else {
        data = await syncCrudService.getNote(user._id.toString(), id);
      }

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public updateEntity = async (
    req: SyncRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = this.requireUser(req.user);
      const entity = this.getRouteParam(req.params.entity);
      const id = this.getRouteParam(req.params.id);

      if (!syncCrudService.isSupportedEntity(entity)) {
        throw new AppError(
          404,
          "Sync entity not found",
          "SYNC_ENTITY_NOT_FOUND",
        );
      }

      let data;

      if (entity === "projects") {
        data = await syncCrudService.updateProject(
          user._id.toString(),
          id,
          req.body,
        );
      } else if (entity === "epics") {
        data = await syncCrudService.updateEpic(
          user._id.toString(),
          id,
          req.body,
        );
      } else if (entity === "tasks") {
        data = await syncCrudService.updateTask(
          user._id.toString(),
          id,
          req.body,
        );
      } else {
        data = await syncCrudService.updateNote(
          user._id.toString(),
          id,
          req.body,
        );
      }

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public deleteEntity = async (
    req: SyncRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const user = this.requireUser(req.user);
      const entity = this.getRouteParam(req.params.entity);
      const id = this.getRouteParam(req.params.id);

      if (!syncCrudService.isSupportedEntity(entity)) {
        throw new AppError(
          404,
          "Sync entity not found",
          "SYNC_ENTITY_NOT_FOUND",
        );
      }

      let data;

      if (entity === "projects") {
        data = await syncCrudService.deleteProject(user._id.toString(), id);
      } else if (entity === "epics") {
        data = await syncCrudService.deleteEpic(user._id.toString(), id);
      } else if (entity === "tasks") {
        data = await syncCrudService.deleteTask(user._id.toString(), id);
      } else {
        data = await syncCrudService.deleteNote(user._id.toString(), id);
      }

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
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

  private requireUser(user: IUserDocument | undefined): IUserDocument {
    if (user == null) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    return user;
  }
}

export default new SyncController();
