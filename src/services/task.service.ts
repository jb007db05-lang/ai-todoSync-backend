import type {
  CreateTaskPayload,
  UpdateTaskPayload,
} from "../repositories/task.repository.js";
import {
  createTask,
  getTasksByUser,
  getTasksByDate,
  getTaskByIdAndUser,
  updateTask,
  deleteTask,
} from "../repositories/task.repository.js";
import type {
  ISubtask,
  ITaskDocument,
  TaskStatus,
  TaskWorkflowStatus,
} from "../models/task.model.js";
import projectService from "./project.service.js";

interface SubtaskDto {
  id: string;
  title: string;
  note?: string;
  status: TaskWorkflowStatus;
  completed: boolean;
  completedAt: Date | null;
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
  subtasks: SubtaskDto[];
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

    if (payload.projectId) {
      await projectService.assertProjectOwnership(
        payload.userId,
        payload.projectId,
      );
    }

    payload.note = this.normalizeOptionalText(payload.note);

    if (payload.status != null) {
      payload.status = this.normalizeTaskStatus(payload.status);
    }

    payload.subtasks = this.normalizeSubtasks(payload.subtasks);
    payload.subtasks = this.applyCompletedStatusToSubtasks(
      payload.status,
      payload.subtasks,
    );

    const task = await createTask(payload);
    return this.toDto(task);
  }

  public async fetchTasks(userId: string, date?: unknown): Promise<TaskDto[]> {
    const normalizedDate = this.normalizeDate(date);
    const tasks = normalizedDate
      ? await getTasksByDate(userId, normalizedDate)
      : await getTasksByUser(userId);
    return tasks.map((task) => this.toDto(task));
  }

  public async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskPayload,
  ): Promise<TaskDto> {
    if (
      Object.prototype.hasOwnProperty.call(updates, "projectId") &&
      updates.projectId
    ) {
      await projectService.assertProjectOwnership(userId, updates.projectId);
    }

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
      const currentTask = await getTaskByIdAndUser(taskId, userId);

      if (currentTask == null) {
        throw new HttpError(404, "Task not found");
      }

      updates.subtasks = this.applyCompletedStatusToSubtasks(
        updates.status,
        updates.subtasks ?? currentTask.subtasks ?? [],
      );
    }

    const updated = await updateTask(taskId, userId, updates);

    if (updated == null) {
      throw new HttpError(404, "Task not found");
    }

    return this.toDto(updated);
  }

  public async deleteTask(taskId: string, userId: string): Promise<void> {
    const deleted = await deleteTask(taskId, userId);

    if (deleted === false) {
      throw new HttpError(404, "Task not found");
    }
  }

  public async getSummary(
    userId: string,
    date?: unknown,
  ): Promise<TaskSummary> {
    const normalizedDate = this.normalizeDate(date);
    const tasks = normalizedDate
      ? await getTasksByDate(userId, normalizedDate)
      : await getTasksByUser(userId);
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
      date: normalizedDate,
    };
  }

  private toDto(task: ITaskDocument): TaskDto {
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
      projectId: task.projectId?.toString() ?? null,
      subtasks: this.toSubtaskDtos(task.subtasks),
    };
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
