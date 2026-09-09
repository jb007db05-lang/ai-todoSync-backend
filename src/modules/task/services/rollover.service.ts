import logger from "../../../lib/logger.js";
import {
  getPendingTasksByDate,
  markTasksRolledOver,
} from "../../../modules/task/repositories/task.repository.js";
import {
  SyncTaskInsertPayload,
  bulkInsertTasks,
} from "../../../modules/sync/repositories/sync.repository.js";
import { formatLocalDate } from "../../../utils/date.js";

interface RolloverResult {
  processed: number;
  duplicated: number;
  date: string;
}

class RolloverService {
  public async runRollover(targetDate?: Date): Promise<RolloverResult> {
    const today = this.formatDate(targetDate ?? new Date());
    const tomorrow = this.computeTomorrow(today);
    const pendingTasks = await getPendingTasksByDate(today);

    if (pendingTasks.length === 0) {
      logger.info("No pending tasks to roll over", { date: today });
      return { processed: 0, duplicated: 0, date: today };
    }

    const inserts: SyncTaskInsertPayload[] = pendingTasks.map((task) => ({
      userId: task.userId.toString(),
      title: task.title,
      description: task.description,
      note: task.note,
      date: tomorrow,
      status: "TODO",
      source: task.source ?? "manual",
      projectId: task.projectId?.toString() ?? null,
      subtasks: task.subtasks?.map((subtask) => ({
        title: subtask.title,
        note: subtask.note,
        status: subtask.status,
        completed: subtask.completed,
        completedAt: subtask.completedAt ?? null,
      })),
      rolledOver: false,
      rolloverCount: task.rolloverCount + 1,
    }));

    const created = await bulkInsertTasks(inserts);
    await markTasksRolledOver(pendingTasks.map((task) => task._id.toString()));

    logger.info("Rollover job completed", {
      date: today,
      processed: pendingTasks.length,
      duplicated: created.length,
    });

    return {
      processed: pendingTasks.length,
      duplicated: created.length,
      date: today,
    };
  }

  private formatDate(date: Date): string {
    return formatLocalDate(date);
  }

  private computeTomorrow(dateString: string): string {
    const [year, month, day] = dateString
      .split("-")
      .map((value) => Number(value));
    const tomorrow = new Date(year, (month ?? 1) - 1, day ?? 1);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.formatDate(tomorrow);
  }
}

const rolloverService = new RolloverService();
export type { RolloverResult };
export default rolloverService;
