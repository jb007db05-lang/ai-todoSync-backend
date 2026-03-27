import { SyncTaskInsertPayload, bulkInsertTasks } from '../repositories/sync.repository.js';
import type { ITaskDocument, TaskStatus } from '../models/task.model.js';

interface RawSyncTaskInput {
  title?: unknown;
  description?: unknown;
  status?: unknown;
  source?: unknown;
}

interface SyncTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  source?: string;
}

interface SyncRequestBody {
  tasks?: unknown;
  date?: unknown;
  source?: unknown;
}

interface SyncSingleRequestBody {
  title?: unknown;
  description?: unknown;
  status?: TaskStatus;
  source?: unknown;
  date?: unknown;
}

interface SyncTaskResult {
  id: string;
  title: string;
  description?: string;
  date: string;
  status: TaskStatus;
  source?: string;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class SyncService {
  private static readonly MAX_TASKS_PER_SYNC = 100;

  public async syncTasks(userId: string, payload: SyncRequestBody): Promise<SyncTaskResult[]> {
    const { date, source } = this.normalizeContext(payload.date, payload.source);
    const tasks = this.parseTasks(payload.tasks);

    if (tasks.length === 0) {
      throw new HttpError(400, 'At least one task is required');
    }

    if (tasks.length > SyncService.MAX_TASKS_PER_SYNC) {
      throw new HttpError(413, `Cannot sync more than ${SyncService.MAX_TASKS_PER_SYNC} tasks at once`);
    }

    const inserts = tasks.map((task) =>
      this.buildInsertPayload(userId, date, source, task)
    );

    const created = await bulkInsertTasks(inserts);
    return created.map(this.toResult);
  }

  public async syncSingleTask(userId: string, payload: SyncSingleRequestBody): Promise<SyncTaskResult> {
    const { date, source } = this.normalizeContext(payload.date, payload.source);
    const task = this.parseTaskInput(payload);

    const insert = this.buildInsertPayload(userId, date, source, task);
    const [created] = await bulkInsertTasks([insert]);

    return this.toResult(created);
  }

  private normalizeContext(dateValue: unknown, sourceValue: unknown): {
    date: string;
    source?: string;
  } {
    const resolvedDate = this.resolveDate(dateValue);
    const resolvedSource = typeof sourceValue === 'string' ? sourceValue : undefined;
    return { date: resolvedDate, source: resolvedSource };
  }

  private resolveDate(value: unknown): string {
    if (typeof value === 'string' && this.isValidDate(value)) {
      return value;
    }

    return new Date().toISOString().slice(0, 10);
  }

  private parseTasks(value: unknown): SyncTaskInput[] {
    if (!Array.isArray(value)) {
      throw new HttpError(400, '`tasks` must be an array');
    }

    return value.map((item) => this.parseTaskInput(item));
  }
  private parseTaskInput(value: unknown): SyncTaskInput {
    if (value == null || typeof value !== 'object') {
      throw new HttpError(400, 'Each task must be an object');
    }

    const task = value as Record<string, unknown>;
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    if (!title) {
      throw new HttpError(400, 'Task title is required');
    }

    const description = typeof task.description === 'string' ? task.description : undefined;
    const status = this.parseStatus(task.status);
    const source = typeof task.source === 'string' ? task.source : undefined;

    return { title, description, status, source };
  }

  private parseStatus(value: unknown): TaskStatus | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === 'pending' || value === 'done') {
      return value;
    }

    throw new HttpError(400, 'Invalid status value');
  }

  private buildInsertPayload(
    userId: string,
    date: string,
    source: string | undefined,
    task: SyncTaskInput
  ): SyncTaskInsertPayload {
    return {
      userId,
      title: task.title,
      description: task.description,
      date,
      status: task.status,
      source: task.source ?? source
    };
  }

  private toResult(task: ITaskDocument): SyncTaskResult {
    return {
      id: task._id.toString(),
      title: task.title,
      description: task.description,
      date: task.date,
      status: task.status,
      source: task.source
    };
  }

  private isValidDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
}

const syncService = new SyncService();
export type { SyncTaskResult };
export default syncService;
