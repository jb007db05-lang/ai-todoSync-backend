import { connectDatabase, disconnectDatabase } from "../../config/db.config.js";
import logger from "../../lib/logger.js";
import TaskModel from "../../modules/task/models/task.model.js";

const backfillTaskAssignments = async (): Promise<void> => {
  await connectDatabase();

  try {
    const result = await TaskModel.updateMany(
      { assignedTo: { $exists: false } },
      [
        {
          $set: {
            assignedTo: "$userId",
            assignedBy: "$userId",
            assignedAt: "$createdAt",
          },
        },
      ],
      { updatePipeline: true } as any,
    ).exec();

    logger.info("Task assignment backfill complete", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } finally {
    await disconnectDatabase();
  }
};

void backfillTaskAssignments().catch((error) => {
  logger.error(
    "Task assignment backfill failed",
    error instanceof Error ? error : new Error("Unknown backfill error"),
  );
  process.exit(1);
});
