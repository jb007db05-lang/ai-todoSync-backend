import { connectDatabase, disconnectDatabase } from "../../config/db.config.js";
import TaskModel from "../../modules/task/models/task.model.js";
import SlaConfigModel from "../../modules/task/models/sla-config.model.js";
import {
  DEFAULT_SLA_CONFIG,
  SLA_PRIORITIES,
  addHours,
} from "../../utils/sla.js";

const run = async (): Promise<void> => {
  await connectDatabase();

  const userIds = await TaskModel.distinct("userId").exec();
  for (const userId of userIds) {
    await Promise.all(
      SLA_PRIORITIES.map((priority) =>
        SlaConfigModel.updateOne(
          { userId, priority },
          {
            $setOnInsert: { userId, priority, ...DEFAULT_SLA_CONFIG[priority] },
          },
          { upsert: true },
        ).exec(),
      ),
    );
  }

  const tasks = await TaskModel.find({
    $or: [
      { slaResponseDueAt: null },
      { slaResolutionDueAt: null },
      { currentSlaState: { $exists: false } },
    ],
  }).exec();

  for (const task of tasks) {
    const config = DEFAULT_SLA_CONFIG[task.priority ?? "MEDIUM"];
    const createdAt = task.createdAt ?? new Date();
    task.slaResponseDueAt =
      task.slaResponseDueAt ?? addHours(createdAt, config.responseTimeHours);
    task.slaResolutionDueAt =
      task.slaResolutionDueAt ??
      addHours(createdAt, config.resolutionTimeHours);
    task.firstResponseAt =
      task.firstResponseAt ??
      (task.status !== "TODO" ? (task.updatedAt ?? createdAt) : null);
    task.completedAt =
      task.completedAt ??
      (task.status === "DONE" ? (task.updatedAt ?? createdAt) : null);
    task.slaPausedAt =
      task.slaPausedAt ??
      (task.status === "BLOCKED" ? (task.updatedAt ?? createdAt) : null);
    task.totalPausedDuration = task.totalPausedDuration ?? 0;
    task.responseBreached = task.responseBreached ?? false;
    task.resolutionBreached = task.resolutionBreached ?? false;
    task.currentSlaState =
      task.status === "DONE"
        ? "COMPLETED"
        : task.status === "BLOCKED"
          ? "PAUSED"
          : "HEALTHY";
    await task.save();
  }

  await disconnectDatabase();
};

void run().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exit(1);
});
