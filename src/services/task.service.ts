import type { CreateTaskPayload, UpdateTaskPayload } from '../repositories/task.repository.js';
import {
  createTask,
  getTasksByUser,
  getTasksByDate,
  updateTask,
  deleteTask
} from '../repositories/task.repository.js';
import type { ITaskDocument, TaskStatus } from '../models/task.model.js';

interface TaskDto {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string;
  status: TaskStatus;
  rolledOver: boolean;
  rolloverCount: number;
  source?: string;
}

interface TaskSummary {
  total: number;
  pending: number;
  done: number;
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
    if (payload.title == null || payload.title === '' || payload.date == null || payload.date === '') {
      throw new HttpError(400, 'Title and date are required');
    }

    const task = await createTask(payload);
    return this.toDto(task);
  }

  public async fetchTasks(userId: string, date?: unknown): Promise<TaskDto[]> {
    const normalizedDate = this.normalizeDate(date);
    const tasks = normalizedDate ? await getTasksByDate(userId, normalizedDate) : await getTasksByUser(userId);
    return tasks.map((task) => this.toDto(task));
  }

  public async updateTask(taskId: string, userId: string, updates: UpdateTaskPayload): Promise<TaskDto> {
    const updated = await updateTask(taskId, userId, updates);

    if (updated == null) {
      throw new HttpError(404, 'Task not found');
    }

    return this.toDto(updated);
  }

  public async deleteTask(taskId: string, userId: string): Promise<void> {
    const deleted = await deleteTask(taskId, userId);

    if (deleted === false) {
      throw new HttpError(404, 'Task not found');
    }
  }

  public async getSummary(userId: string, date?: unknown): Promise<TaskSummary> {
    const normalizedDate = this.normalizeDate(date);
    const tasks = normalizedDate ? await getTasksByDate(userId, normalizedDate) : await getTasksByUser(userId);
    const total = tasks.length;
    const pending = tasks.filter((task) => task.status === 'pending').length;
    const done = tasks.filter((task) => task.status === 'done').length;
    const rolledOver = tasks.filter((task) => task.status === 'rolled_over').length;

    return { total, pending, done, rolledOver, date: normalizedDate };
  }

  private toDto(task: ITaskDocument): TaskDto {
    return {
      id: task._id.toString(),
      userId: task.userId.toString(),
      title: task.title,
      description: task.description,
      date: task.date,
      status: task.status,
      rolledOver: task.rolledOver,
      rolloverCount: task.rolloverCount,
      source: task.source
    };
  }

  private normalizeDate(input?: unknown): string | undefined {
    if (typeof input === 'string') {
      return input;
    }

    if (Array.isArray(input)) {
      return input.find((item): item is string => typeof item === 'string');
    }

    return undefined;
  }
}

const taskService = new TaskService();
export type { TaskDto, TaskSummary };
export default taskService;
