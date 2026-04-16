import type {
  CreateTaskPayload,
  UpdateTaskPayload,
} from "../repositories/task.repository.js";
import {
  createTask,
  deleteTask,
  getTaskById,
  getTaskByIdAndUser,
  getTasksByDate,
  getTasksByUser,
  updateTask,
} from "../repositories/task.repository.js";
import type { TaskDocumentWithAssignee } from "../repositories/task.repository.js";
import type {
  ISubtask,
  TaskStatus,
  TaskWorkflowStatus,
} from "../models/task.model.js";
import type { ProjectRole } from "../models/project-member.model.js";
import type { IUserDocument } from "../models/user.model.js";
import { getProjectMembershipsByUser } from "../repositories/project-member.repository.js";
import projectService from "./project.service.js";
import epicService from "./epic.service.js";

interface TaskUserDto {
  id: string;
  email: string;
  name: string | null;
}

interface SubtaskDto {
  id: string;
  title: string;
  note?: string;
  status: TaskWorkflowStatus;
  completed: boolean;
  completedAt: Date | null;
}

interface TaskPermissionsDto {
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canUpdate: boolean;
}

interface TaskDto {
  id: string;
  userId: string;
  title: string;
  description?: string;
  note?: string;
  date: string;
  status: TaskStatus;
  rolledOver: boolean;
  rolloverCount: number;
  source?: string;
  projectId: string | null;
  epicId: string | null;
  assignedToUserId: string | null;
  assignedToUser: TaskUserDto | null;
  subtasks: SubtaskDto[];
  permissions: TaskPermissionsDto;
}

interface TaskSummary {
  total: number;
  pending: number;
  inProgress: number;
  inReview: number;
  completed: number;
  rolledOver: number;
  date?: string;
}

interface AssignTaskPayload {
  userId?: unknown;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class TaskService {
  public async createTask(payload: CreateTaskPayload): Promise<TaskDto> {
    if (
      payload.title == null ||
      payload.title === "" ||
      payload.date == null ||
      payload.date === ""
    ) {
      throw new HttpError(400, "Title and date are required");
    }

    payload.projectId = this.normalizeNullableId(payload.projectId);
    payload.epicId = this.normalizeNullableId(payload.epicId);
    payload.assignedToUserId = null;

    if (payload.projectId) {
      await projectService.assertProjectRole(
        payload.userId,
        payload.projectId,
        "ADMIN",
      );
    }

    payload.epicId = await this.resolveEpicId(
      payload.projectId,
      payload.epicId,
      payload.userId,
    );

    payload.note = this.normalizeOptionalText(payload.note);

    if (payload.status != null) {
      payload.status = this.normalizeTaskStatus(payload.status);
    }

    payload.subtasks = this.normalizeSubtasks(payload.subtasks);
    payload.subtasks = this.applyCompletedStatusToSubtasks(
      payload.status,
      payload.subtasks,
    );
    payload.status = this.reconcileTaskStatusWithSubtasks(
      payload.status,
      payload.subtasks,
    );

    const task = await createTask(payload);
    return this.toDto(
      payload.userId,
      task,
      payload.projectId
        ? new Map([[payload.projectId, "ADMIN" as const]])
        : new Map(),
    );
  }

  public async fetchTasks(userId: string, date?: unknown): Promise<TaskDto[]> {
    const normalizedDate = this.normalizeDate(date);
    const memberships = await getProjectMembershipsByUser(userId);
    const projectIds = memberships.map((membership) =>
      membership.projectId.toString(),
    );
    const roleMap = this.buildRoleMap(memberships);
    const tasks = normalizedDate
      ? await getTasksByDate(userId, projectIds, normalizedDate)
      : await getTasksByUser(userId, projectIds);
    return tasks.map((task) => this.toDto(userId, task, roleMap));
  }

  public async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskPayload,
  ): Promise<TaskDto> {
    const memberships = await getProjectMembershipsByUser(userId);
    const roleMap = this.buildRoleMap(memberships);
    const currentTask = await getTaskByIdAndUser(
      taskId,
      userId,
      Array.from(roleMap.keys()),
    );

    if (currentTask == null) {
      throw new HttpError(404, "Task not found");
    }

    const currentRole = currentTask.projectId
      ? (roleMap.get(currentTask.projectId.toString()) ?? null)
      : null;
    const permission = this.getTaskPermission(userId, currentTask, currentRole);

    if (permission.canUpdate === false) {
      throw new HttpError(403, "Task update not allowed");
    }

    if (Object.prototype.hasOwnProperty.call(updates, "assignedToUserId")) {
      throw new HttpError(
        400,
        "Use the dedicated task assignment endpoint to change assignees",
      );
    }

    const hasFullEditAccess = permission.canEdit;

    if (!hasFullEditAccess) {
      const disallowedFields = [
        "title",
        "description",
        "date",
        "projectId",
        "epicId",
      ];
      const attemptedRestrictedField = disallowedFields.some((field) =>
        Object.prototype.hasOwnProperty.call(updates, field),
      );

      if (attemptedRestrictedField) {
        throw new HttpError(
          403,
          "Assigned members can only update status, notes, and subtasks",
        );
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "projectId")) {
      updates.projectId = this.normalizeNullableId(updates.projectId);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "epicId")) {
      updates.epicId = this.normalizeNullableId(updates.epicId);
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, "projectId") &&
      updates.projectId
    ) {
      await projectService.assertProjectRole(
        userId,
        updates.projectId,
        "ADMIN",
      );
    }

    const nextProjectId = Object.prototype.hasOwnProperty.call(
      updates,
      "projectId",
    )
      ? (updates.projectId ?? null)
      : (currentTask.projectId?.toString() ?? null);

    updates.projectId = nextProjectId;
    updates.epicId = await this.resolveUpdatedEpicId(
      userId,
      currentTask.projectId?.toString() ?? null,
      currentTask.epicId?.toString() ?? null,
      nextProjectId,
      Object.prototype.hasOwnProperty.call(updates, "epicId")
        ? updates.epicId
        : undefined,
    );

    if (
      Object.prototype.hasOwnProperty.call(updates, "status") &&
      updates.status != null
    ) {
      updates.status = this.normalizeTaskStatus(updates.status);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "note")) {
      updates.note = this.normalizeOptionalText(updates.note);
    }

    if (Object.prototype.hasOwnProperty.call(updates, "subtasks")) {
      updates.subtasks = this.normalizeSubtasks(updates.subtasks);
    }

    if (updates.status === "completed") {
      updates.subtasks = this.applyCompletedStatusToSubtasks(
        updates.status,
        updates.subtasks ?? currentTask.subtasks ?? [],
      );
    }

    if (Object.prototype.hasOwnProperty.call(updates, "subtasks")) {
      updates.status = this.reconcileTaskStatusWithSubtasks(
        updates.status ?? this.normalizeStoredTaskStatus(currentTask.status),
        updates.subtasks ?? [],
      );
    }

    const updated = await updateTask(taskId, updates);

    if (updated == null) {
      throw new HttpError(404, "Task not found");
    }

    return this.toDto(userId, updated, roleMap);
  }

  public async assignTask(
    taskId: string,
    actorUserId: string,
    payload: AssignTaskPayload,
  ): Promise<TaskDto> {
    const task = await getTaskById(taskId);

    if (task == null) {
      throw new HttpError(404, "Task not found");
    }

    if (task.projectId == null) {
      throw new HttpError(400, "Task assignment requires a project task");
    }

    const projectId = task.projectId.toString();
    const access = await projectService.assertProjectMembership(
      actorUserId,
      projectId,
    );
    const isCreator = task.userId.toString() === actorUserId;

    if (access.role !== "ADMIN" && !isCreator) {
      throw new HttpError(
        403,
        "Only project admins or the task creator can assign tasks",
      );
    }

    const assignedToUserId = this.normalizeNullableId(payload.userId);

    if (assignedToUserId != null) {
      await projectService.assertProjectMembership(assignedToUserId, projectId);
    }

    const updated = await updateTask(taskId, {
      assignedToUserId,
    });

    if (updated == null) {
      throw new HttpError(404, "Task not found");
    }

    return this.toDto(
      actorUserId,
      updated,
      new Map([[projectId, access.role]]),
    );
  }

  public async deleteTask(taskId: string, userId: string): Promise<void> {
    const memberships = await getProjectMembershipsByUser(userId);
    const roleMap = this.buildRoleMap(memberships);
    const task = await getTaskByIdAndUser(
      taskId,
      userId,
      Array.from(roleMap.keys()),
    );

    if (task == null) {
      throw new HttpError(404, "Task not found");
    }

    const currentRole = task.projectId
      ? (roleMap.get(task.projectId.toString()) ?? null)
      : null;
    const permission = this.getTaskPermission(userId, task, currentRole);

    if (permission.canDelete === false) {
      throw new HttpError(403, "Task deletion not allowed");
    }

    const deleted = await deleteTask(taskId);

    if (deleted === false) {
      throw new HttpError(404, "Task not found");
    }
  }

  public async getSummary(
    userId: string,
    date?: unknown,
  ): Promise<TaskSummary> {
    const tasks = await this.fetchTasks(userId, date);
    const total = tasks.length;
    const pending = tasks.filter((task) => task.status === "pending").length;
    const inProgress = tasks.filter(
      (task) => task.status === "in_progress",
    ).length;
    const inReview = tasks.filter((task) => task.status === "in_review").length;
    const completed = tasks.filter(
      (task) => task.status === "completed",
    ).length;
    const rolledOver = tasks.filter(
      (task) => task.status === "rolled_over",
    ).length;

    return {
      total,
      pending,
      inProgress,
      inReview,
      completed,
      rolledOver,
      date: this.normalizeDate(date),
    };
  }

  private toDto(
    currentUserId: string,
    task: TaskDocumentWithAssignee,
    roleMap: Map<string, ProjectRole>,
  ): TaskDto {
    const projectId = task.projectId?.toString() ?? null;
    const currentRole = projectId ? (roleMap.get(projectId) ?? null) : null;
    const permissions = this.getTaskPermission(
      currentUserId,
      task,
      currentRole,
    );
    const assignedUser = this.toTaskUser(task.assignedToUserId);

    return {
      id: task._id.toString(),
      userId: task.userId.toString(),
      title: task.title,
      description: task.description,
      note: task.note,
      date: task.date,
      status: this.normalizeStoredTaskStatus(task.status),
      rolledOver: task.rolledOver,
      rolloverCount: task.rolloverCount,
      source: task.source,
      projectId,
      epicId: task.epicId?.toString() ?? null,
      assignedToUserId: assignedUser?.id ?? null,
      assignedToUser: assignedUser,
      subtasks: this.toSubtaskDtos(task.subtasks),
      permissions,
    };
  }

  private toTaskUser(value: unknown): TaskUserDto | null {
    if (value == null || typeof value !== "object") {
      return null;
    }

    const user = value as IUserDocument;

    if (user._id == null || user.email == null) {
      return null;
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name ?? null,
    };
  }

  private buildRoleMap(
    memberships: Awaited<ReturnType<typeof getProjectMembershipsByUser>>,
  ): Map<string, ProjectRole> {
    return new Map(
      memberships.map((membership) => [
        membership.projectId.toString(),
        membership.role,
      ]),
    );
  }

  private getTaskPermission(
    currentUserId: string,
    task: TaskDocumentWithAssignee,
    role: ProjectRole | null,
  ): TaskPermissionsDto {
    const isCreator = task.userId.toString() === currentUserId;
    const isAdmin = role === "ADMIN";
    const assignedToUser = this.toTaskUser(task.assignedToUserId);
    const isAssignee = assignedToUser?.id === currentUserId;

    return {
      canEdit: isAdmin || isCreator,
      canDelete: isAdmin || isCreator,
      canAssign: task.projectId != null && (isAdmin || isCreator),
      canUpdate: isAdmin || isCreator || isAssignee,
    };
  }

  private async resolveEpicId(
    projectId: string | null,
    epicId: string | null | undefined,
    userId: string,
  ): Promise<string | null> {
    if (epicId == null) {
      return null;
    }

    if (projectId == null) {
      throw new HttpError(400, "Epic assignment requires a project");
    }

    await projectService.assertProjectMembership(userId, projectId);
    const epic = await epicService.assertEpicInProject(projectId, epicId);
    return epic.id;
  }

  private async resolveUpdatedEpicId(
    userId: string,
    currentProjectId: string | null,
    currentEpicId: string | null,
    nextProjectId: string | null,
    requestedEpicId: string | null | undefined,
  ): Promise<string | null> {
    if (requestedEpicId !== undefined) {
      return this.resolveEpicId(nextProjectId, requestedEpicId, userId);
    }

    if (currentProjectId !== nextProjectId) {
      if (currentEpicId == null || nextProjectId == null) {
        return null;
      }

      if (currentProjectId == null) {
        return null;
      }

      const currentEpic = await epicService.assertEpicInProject(
        currentProjectId,
        currentEpicId,
      );

      if (currentEpic.projectId !== nextProjectId) {
        return null;
      }
    }

    return currentEpicId;
  }

  private toSubtaskDtos(subtasks?: ISubtask[]): SubtaskDto[] {
    return (subtasks ?? []).map((subtask) => ({
      id: this.getSubtaskId(subtask),
      title: subtask.title,
      note: subtask.note,
      status: subtask.status,
      completed: subtask.completed,
      completedAt: subtask.completedAt ?? null,
    }));
  }

  private getSubtaskId(subtask: ISubtask): string {
    const subtaskWithId = subtask as ISubtask & { _id?: unknown };
    return subtaskWithId._id != null ? String(subtaskWithId._id) : "";
  }

  private normalizeSubtasks(subtasks: unknown): ISubtask[] {
    if (subtasks === undefined) {
      return [];
    }

    if (!Array.isArray(subtasks)) {
      throw new HttpError(400, "Subtasks must be an array");
    }

    return subtasks.map((subtask, index) =>
      this.normalizeSubtask(subtask, index),
    );
  }

  private normalizeSubtask(value: unknown, index: number): ISubtask {
    if (value == null || typeof value !== "object") {
      throw new HttpError(400, `Subtask at index ${index} must be an object`);
    }

    const subtask = value as Record<string, unknown>;
    const title = typeof subtask.title === "string" ? subtask.title.trim() : "";
    const note = typeof subtask.note === "string" ? subtask.note.trim() : "";

    if (!title) {
      throw new HttpError(400, `Subtask at index ${index} requires a title`);
    }

    const status = this.normalizeWorkflowStatus(subtask.status);
    const completed = status === "completed";
    const completedAt = completed
      ? this.normalizeCompletedAt(subtask.completedAt)
      : null;

    return {
      title,
      note,
      status,
      completed,
      completedAt,
    };
  }

  private normalizeTaskStatus(status: TaskStatus): TaskStatus {
    if (status === "rolled_over") {
      return status;
    }

    return this.normalizeWorkflowStatus(status);
  }

  private normalizeStoredTaskStatus(status: string): TaskStatus {
    return status === "done" ? "completed" : (status as TaskStatus);
  }

  private applyCompletedStatusToSubtasks(
    taskStatus: TaskStatus | undefined,
    subtasks: ISubtask[],
  ): ISubtask[] {
    if (taskStatus !== "completed") {
      return subtasks;
    }

    return subtasks.map((subtask) => ({
      ...subtask,
      status: "completed",
      completed: true,
      completedAt: subtask.completedAt ?? new Date(),
    }));
  }

  private reconcileTaskStatusWithSubtasks(
    taskStatus: TaskStatus | undefined,
    subtasks: ISubtask[],
  ): TaskStatus | undefined {
    if (subtasks.length === 0) {
      return taskStatus;
    }

    const normalizedTaskStatus =
      taskStatus == null
        ? undefined
        : this.normalizeStoredTaskStatus(taskStatus);

    if (subtasks.every((subtask) => subtask.status === "completed")) {
      return "completed";
    }

    if (normalizedTaskStatus !== "completed") {
      return normalizedTaskStatus;
    }

    if (subtasks.some((subtask) => subtask.status === "in_review")) {
      return "in_review";
    }

    if (subtasks.some((subtask) => subtask.status === "in_progress")) {
      return "in_progress";
    }

    return "pending";
  }

  private normalizeWorkflowStatus(value: unknown): TaskWorkflowStatus {
    if (value === "done") {
      return "completed";
    }

    if (
      value === "pending" ||
      value === "in_progress" ||
      value === "in_review" ||
      value === "completed"
    ) {
      return value;
    }

    return "pending";
  }

  private normalizeCompletedAt(value: unknown): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === "string") {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return new Date();
  }

  private normalizeOptionalText(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    return value.trim();
  }

  private normalizeNullableId(value: unknown): string | null {
    if (value == null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new HttpError(400, "Invalid identifier value");
    }

    const normalizedValue = value.trim();
    return normalizedValue === "" ? null : normalizedValue;
  }

  private normalizeDate(input?: unknown): string | undefined {
    if (typeof input === "string") {
      return input;
    }

    if (Array.isArray(input)) {
      return input.find((item): item is string => typeof item === "string");
    }

    return undefined;
  }
}

const taskService = new TaskService();
export type { TaskDto, TaskSummary };
export default taskService;
