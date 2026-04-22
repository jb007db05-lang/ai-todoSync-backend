import { Types } from "mongoose";

import EpicModel from "../models/epic.model.js";
import NoteModel, { type NoteParentType } from "../models/note.model.js";
import ProjectModel from "../models/project.model.js";
import TaskModel from "../models/task.model.js";
import {
  projectPopulateOptions,
  getProjectById,
} from "../repositories/project.repository.js";
import {
  getTaskById,
  taskPopulateOptions,
} from "../repositories/task.repository.js";
import { getProjectMembershipsByUser } from "../repositories/project-member.repository.js";
import epicService from "./epic.service.js";
import noteService from "./note.service.js";
import projectService from "./project.service.js";
import taskService from "./task.service.js";
import { AppError } from "../utils/app-error.js";
import {
  buildRefInMatch,
  buildRefMatch,
  buildSafeRefInMatch,
  buildSafeRefMatch,
} from "../utils/mongo-ref.js";

interface PaginationParams {
  page?: unknown;
  limit?: unknown;
}

interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface ProjectPayload {
  name?: string;
  description?: string;
}

interface EpicPayload {
  projectId?: string;
  name?: string;
  description?: string;
  status?: string;
}

interface TaskPayload {
  title?: string;
  description?: string;
  note?: string;
  date?: string;
  status?: string;
  priority?: string;
  source?: string;
  projectId?: string | null;
  epicId?: string | null;
  assignedTo?: string;
  subtasks?: unknown[];
}

interface NotePayload {
  title?: string;
  content?: string;
  appendContent?: boolean;
  parentType?: NoteParentType;
  parentId?: string;
}

type SyncListEntity = "projects" | "epics" | "tasks" | "notes";

class SyncCrudService {
  public async listProjects(
    userId: string,
    pagination: PaginationParams,
  ): Promise<PaginationResult<unknown>> {
    const memberships = await getProjectMembershipsByUser(userId);
    const projectIds = memberships.map((membership) =>
      membership.projectId.toString(),
    );

    if (projectIds.length === 0) {
      const { page, limit } = this.normalizePagination(pagination);
      return { data: [], total: 0, page, limit };
    }

    const { page, limit, skip } = this.normalizePagination(pagination);
    const [data, total] = await Promise.all([
      ProjectModel.find(buildSafeRefInMatch("_id", projectIds))
        .populate(projectPopulateOptions)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      ProjectModel.countDocuments(
        buildSafeRefInMatch("_id", projectIds),
      ).exec(),
    ]);

    const roleByProject = new Map(
      memberships.map((membership) => [
        membership.projectId.toString(),
        membership.role,
      ]),
    );

    return {
      data: data.map((project) => ({
        id: project._id.toString(),
        name: project.name,
        description: project.description ?? "",
        userId: this.getProjectOwnerId(project.userId),
        currentUserRole: roleByProject.get(project._id.toString()) ?? "MEMBER",
        creator: this.getProjectCreator(project.userId),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  public async createProject(userId: string, payload: ProjectPayload) {
    return projectService.createProject(userId, payload);
  }

  public async getProject(userId: string, projectId: string) {
    await projectService.assertProjectMembership(userId, projectId);
    const project = await getProjectById(projectId);

    if (project == null) {
      throw new AppError(404, "Project not found", "PROJECT_NOT_FOUND");
    }

    const memberships = await getProjectMembershipsByUser(userId);
    const membership = memberships.find(
      (entry) => entry.projectId.toString() === projectId,
    );

    return {
      id: project._id.toString(),
      name: project.name,
      description: project.description ?? "",
      userId: this.getProjectOwnerId(project.userId),
      currentUserRole: membership?.role ?? "MEMBER",
      creator: this.getProjectCreator(project.userId),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  public async updateProject(
    userId: string,
    projectId: string,
    payload: ProjectPayload,
  ) {
    return projectService.updateProject(projectId, userId, payload);
  }

  public async deleteProject(userId: string, projectId: string) {
    await projectService.deleteProject(projectId, userId);
    return { id: projectId };
  }

  public async listEpics(
    userId: string,
    pagination: PaginationParams,
    projectId?: string,
  ): Promise<PaginationResult<unknown>> {
    const memberships = await getProjectMembershipsByUser(userId);
    const allowedProjectIds = memberships.map((membership) =>
      membership.projectId.toString(),
    );

    if (projectId != null) {
      await projectService.assertProjectMembership(userId, projectId);
    }

    if (allowedProjectIds.length === 0) {
      const { page, limit } = this.normalizePagination(pagination);
      return { data: [], total: 0, page, limit };
    }

    const { page, limit, skip } = this.normalizePagination(pagination);
    const query =
      projectId != null
        ? buildSafeRefMatch("projectId", projectId)
        : buildSafeRefInMatch("projectId", allowedProjectIds);

    const [data, total] = await Promise.all([
      EpicModel.find(query)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      EpicModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((epic) => ({
        id: epic._id.toString(),
        name: epic.name,
        description: epic.description ?? "",
        projectId: epic.projectId.toString(),
        status: epic.status ?? "planned",
        order: epic.order,
        createdAt: epic.createdAt,
        updatedAt: epic.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  public async createEpic(userId: string, payload: EpicPayload) {
    const projectId = this.requireString(payload.projectId, "projectId");
    return epicService.createEpic(userId, projectId, payload);
  }

  public async getEpic(userId: string, epicId: string) {
    const epic = await epicService.getEpicById(epicId);

    if (epic == null) {
      throw new AppError(404, "Epic not found", "EPIC_NOT_FOUND");
    }

    await projectService.assertProjectMembership(userId, epic.projectId);
    return epic;
  }

  public async updateEpic(
    userId: string,
    epicId: string,
    payload: EpicPayload,
  ) {
    const epic = await epicService.getEpicById(epicId);

    if (epic == null) {
      throw new AppError(404, "Epic not found", "EPIC_NOT_FOUND");
    }

    return epicService.updateEpic(userId, epic.projectId, epicId, payload);
  }

  public async deleteEpic(userId: string, epicId: string) {
    const epic = await epicService.getEpicById(epicId);

    if (epic == null) {
      throw new AppError(404, "Epic not found", "EPIC_NOT_FOUND");
    }

    await epicService.deleteEpic(userId, epic.projectId, epicId);
    return { id: epicId };
  }

  public async listTasks(
    userId: string,
    pagination: PaginationParams,
    filters: {
      date?: unknown;
      projectId?: unknown;
      epicId?: unknown;
      search?: unknown;
    },
  ): Promise<PaginationResult<unknown>> {
    const tasks = await taskService.fetchTasks(
      userId,
      filters.date,
      undefined,
      typeof filters.search === "string" ? filters.search : undefined,
    );

    const projectId =
      typeof filters.projectId === "string" && filters.projectId.trim() !== ""
        ? filters.projectId
        : undefined;
    const epicId =
      typeof filters.epicId === "string" && filters.epicId.trim() !== ""
        ? filters.epicId
        : undefined;

    const filtered = tasks.filter((task) => {
      if (projectId && task.projectId !== projectId) {
        return false;
      }
      if (epicId && task.epicId !== epicId) {
        return false;
      }
      return true;
    });

    return this.paginateArray(filtered, pagination);
  }

  public async createTask(userId: string, payload: TaskPayload) {
    return taskService.createTask({
      userId,
      title: payload.title ?? "",
      description: payload.description,
      note: payload.note,
      date: payload.date ?? "",
      status: payload.status as never,
      priority: payload.priority as never,
      source: payload.source,
      projectId: payload.projectId,
      epicId: payload.epicId,
      assignedTo: payload.assignedTo ?? userId,
      subtasks: payload.subtasks as never,
    });
  }

  public async getTask(userId: string, taskId: string) {
    const task = await getTaskById(taskId);

    if (task == null) {
      throw new AppError(404, "Task not found", "TASK_NOT_FOUND");
    }

    const accessibleTasks = await taskService.fetchTasks(userId);
    const matched = accessibleTasks.find((entry) => entry.id === taskId);

    if (matched == null) {
      throw new AppError(403, "Task access denied", "TASK_ACCESS_DENIED");
    }

    return matched;
  }

  public async updateTask(
    userId: string,
    taskId: string,
    payload: TaskPayload,
  ) {
    return taskService.updateTask(taskId, userId, payload as never);
  }

  public async deleteTask(userId: string, taskId: string) {
    await taskService.deleteTask(taskId, userId);
    return { id: taskId };
  }

  public async listNotes(
    userId: string,
    pagination: PaginationParams,
    filters: {
      parentType?: unknown;
      parentId?: unknown;
      projectId?: unknown;
    },
  ): Promise<PaginationResult<unknown>> {
    const memberships = await getProjectMembershipsByUser(userId);
    const allowedProjectIds = memberships.map((membership) =>
      membership.projectId.toString(),
    );
    const parentType = this.optionalParentType(filters.parentType);
    const parentId =
      typeof filters.parentId === "string" && filters.parentId.trim() !== ""
        ? filters.parentId
        : undefined;
    const projectId =
      typeof filters.projectId === "string" && filters.projectId.trim() !== ""
        ? filters.projectId
        : undefined;

    if (projectId != null) {
      await projectService.assertProjectMembership(userId, projectId);
    }

    const { page, limit, skip } = this.normalizePagination(pagination);
    const query: Record<string, unknown> = {};

    if (projectId != null) {
      Object.assign(query, buildSafeRefMatch("projectId", projectId));
    } else if (allowedProjectIds.length > 0) {
      Object.assign(query, buildSafeRefInMatch("projectId", allowedProjectIds));
    } else {
      return { data: [], total: 0, page, limit };
    }

    if (parentType != null) {
      query.parentType = parentType;
    }

    if (parentId != null) {
      Object.assign(query, buildSafeRefMatch("parentId", parentId));
    }

    const [data, total] = await Promise.all([
      NoteModel.find(query)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      NoteModel.countDocuments(query).exec(),
    ]);

    return {
      data: data.map((note) => this.toNoteDto(note)),
      total,
      page,
      limit,
    };
  }

  public async createNote(userId: string, payload: NotePayload) {
    const parentType = this.requireParentType(payload.parentType);
    const parentId = this.requireString(payload.parentId, "parentId");
    const context = await this.resolveNoteParentContext(
      userId,
      parentType,
      parentId,
    );
    const title = this.requireString(payload.title, "title");
    const content = typeof payload.content === "string" ? payload.content : "";

    const note = await NoteModel.create({
      entityType:
        context.parentType === "project" || context.parentType === "epic"
          ? context.parentType
          : undefined,
      parentType: context.parentType,
      parentId: context.parentId,
      projectId: context.projectId,
      epicId: context.epicId,
      title,
      content,
    });

    return this.toNoteDto(note.toObject());
  }

  public async getNote(userId: string, noteId: string) {
    const note = await NoteModel.findById(noteId).lean().exec();

    if (note == null) {
      throw new AppError(404, "Note not found", "NOTE_NOT_FOUND");
    }

    await this.assertNoteAccess(userId, note);
    return this.toNoteDto(note);
  }

  public async updateNote(
    userId: string,
    noteId: string,
    payload: NotePayload,
  ) {
    await noteService.fetchNote(userId, noteId);
    const note = await noteService.updateNote(userId, noteId, payload);
    return note;
  }

  public async deleteNote(userId: string, noteId: string) {
    await noteService.deleteNote(userId, noteId);
    return { id: noteId };
  }

  public isSupportedEntity(value: string): value is SyncListEntity {
    return (
      value === "projects" ||
      value === "epics" ||
      value === "tasks" ||
      value === "notes"
    );
  }

  private async assertNoteAccess(
    userId: string,
    note: {
      projectId?: Types.ObjectId | string | null;
      parentType: NoteParentType;
      parentId: Types.ObjectId | string;
    },
  ): Promise<void> {
    const projectId = note.projectId?.toString() ?? null;

    if (projectId == null) {
      throw new AppError(
        400,
        "Note is missing project context",
        "INVALID_NOTE",
      );
    }

    await projectService.assertProjectMembership(userId, projectId);
  }

  private async resolveNoteParentContext(
    userId: string,
    parentType: NoteParentType,
    parentId: string,
  ): Promise<{
    parentType: NoteParentType;
    parentId: Types.ObjectId | string;
    projectId: Types.ObjectId | string | null;
    epicId: Types.ObjectId | string | null;
  }> {
    if (parentType === "project") {
      await projectService.assertProjectMembership(userId, parentId);
      return {
        parentType,
        parentId: this.toStoredReference(parentId),
        projectId: this.toStoredReference(parentId),
        epicId: null,
      };
    }

    if (parentType === "epic") {
      const epic = await epicService.getEpicById(parentId);

      if (epic == null) {
        throw new AppError(404, "Epic not found", "EPIC_NOT_FOUND");
      }

      await projectService.assertProjectMembership(userId, epic.projectId);
      return {
        parentType,
        parentId: this.toStoredReference(parentId),
        projectId: this.toStoredReference(epic.projectId),
        epicId: this.toStoredReference(parentId),
      };
    }

    if (parentType === "task") {
      const task = await getTaskById(parentId);

      if (task == null) {
        throw new AppError(404, "Task not found", "TASK_NOT_FOUND");
      }

      const projectId = task.projectId?.toString() ?? null;

      if (projectId == null) {
        throw new AppError(
          400,
          "Task notes require task to belong to a project",
          "TASK_PROJECT_REQUIRED",
        );
      }

      await projectService.assertProjectMembership(userId, projectId);
      return {
        parentType,
        parentId: this.toStoredReference(parentId),
        projectId: this.toStoredReference(projectId),
        epicId:
          task.epicId != null
            ? this.toStoredReference(task.epicId.toString())
            : null,
      };
    }

    const task = await TaskModel.findOne({ "subtasks._id": parentId })
      .populate(taskPopulateOptions)
      .exec();

    if (task == null) {
      throw new AppError(404, "Subtask not found", "SUBTASK_NOT_FOUND");
    }

    const projectId = task.projectId?.toString() ?? null;

    if (projectId == null) {
      throw new AppError(
        400,
        "Subtask notes require parent task to belong to a project",
        "TASK_PROJECT_REQUIRED",
      );
    }

    await projectService.assertProjectMembership(userId, projectId);
    return {
      parentType,
      parentId: this.toStoredReference(parentId),
      projectId: this.toStoredReference(projectId),
      epicId:
        task.epicId != null
          ? this.toStoredReference(task.epicId.toString())
          : null,
    };
  }

  private toStoredReference(value: string): Types.ObjectId | string {
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
  }

  private getProjectOwnerId(userId: unknown): string {
    if (typeof userId === "string") {
      return userId;
    }

    if (userId instanceof Types.ObjectId) {
      return userId.toString();
    }

    if (
      typeof userId === "object" &&
      userId !== null &&
      "_id" in userId &&
      (typeof userId._id === "string" || userId._id instanceof Types.ObjectId)
    ) {
      return userId._id.toString();
    }

    return "";
  }

  private getProjectCreator(
    userId: unknown,
  ): { id: string; email: string; name: string | null } | undefined {
    if (
      typeof userId !== "object" ||
      userId === null ||
      !("_id" in userId) ||
      !(typeof userId._id === "string" || userId._id instanceof Types.ObjectId)
    ) {
      return undefined;
    }

    return {
      id: userId._id.toString(),
      email:
        "email" in userId && typeof userId.email === "string"
          ? userId.email
          : "",
      name:
        "name" in userId &&
        (typeof userId.name === "string" || userId.name == null)
          ? (userId.name ?? null)
          : null,
    };
  }

  private toNoteDto(note: {
    _id?: Types.ObjectId;
    id?: string;
    entityType?: "project" | "epic";
    parentType: NoteParentType;
    parentId: Types.ObjectId | string;
    projectId?: Types.ObjectId | string | null;
    epicId?: Types.ObjectId | string | null;
    title: string;
    content: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const id = note.id ?? note._id?.toString() ?? "";
    const entityType =
      note.entityType ??
      (note.parentType === "project"
        ? "project"
        : note.parentType === "epic"
          ? "epic"
          : "project");

    return {
      id,
      entityType,
      parentType: note.parentType,
      parentId: note.parentId.toString(),
      projectId: note.projectId?.toString() ?? "",
      epicId: note.epicId?.toString() ?? null,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }

  private paginateArray<T>(
    items: T[],
    pagination: PaginationParams,
  ): PaginationResult<T> {
    const { page, limit, skip } = this.normalizePagination(pagination);

    return {
      data: items.slice(skip, skip + limit),
      total: items.length,
      page,
      limit,
    };
  }

  private normalizePagination(pagination: PaginationParams) {
    const page = this.parsePositiveInteger(pagination.page, 1);
    const limit = Math.min(
      this.parsePositiveInteger(pagination.limit, 20),
      100,
    );
    const skip = (page - 1) * limit;

    return { page, limit, skip };
  }

  private parsePositiveInteger(value: unknown, fallback: number): number {
    const parsed =
      typeof value === "string" ? Number.parseInt(value, 10) : Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new AppError(
        400,
        `${field} is required`,
        `${field.toUpperCase()}_REQUIRED`,
      );
    }

    return value.trim();
  }

  private optionalParentType(value: unknown): NoteParentType | undefined {
    if (value == null || value === "") {
      return undefined;
    }

    return this.requireParentType(value);
  }

  private requireParentType(value: unknown): NoteParentType {
    if (
      value === "project" ||
      value === "epic" ||
      value === "task" ||
      value === "subtask"
    ) {
      return value;
    }

    throw new AppError(
      400,
      "parentType must be one of project, epic, task, subtask",
      "INVALID_PARENT_TYPE",
    );
  }
}

export default new SyncCrudService();
