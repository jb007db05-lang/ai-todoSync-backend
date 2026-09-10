import { createHash } from "crypto";

import { connectDatabase, disconnectDatabase } from "../../config/db.config.js";
import ActivityLogModel from "../../modules/audit/models/activity-log.model.js";
import TaskModel from "../../modules/task/models/task.model.js";

const hashActivity = (input: Record<string, unknown>): string =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");

const run = async (): Promise<void> => {
  await connectDatabase();

  const projectIds = await ActivityLogModel.distinct("projectId").exec();
  for (const projectId of projectIds) {
    const logs = await ActivityLogModel.find({ projectId })
      .sort({ createdAt: 1, _id: 1 })
      .lean();
    let previousHash: string | null = null;
    let sequence = 1;

    for (const log of logs) {
      const immutableHash: string =
        log.immutableHash ||
        hashActivity({
          projectId: log.projectId,
          entityType: log.entityType,
          entityId: log.entityId,
          action: log.action,
          userId: log.userId,
          description: log.description,
          sequence,
          previousHash,
        });

      await ActivityLogModel.collection.updateOne(
        { _id: log._id },
        {
          $set: {
            sequence,
            previousHash,
            immutableHash,
            metadata: log.metadata ?? {},
            legalHold: log.legalHold ?? false,
            retentionUntil: log.retentionUntil ?? null,
            approvalId: log.approvalId ?? null,
          },
        },
      );

      previousHash = immutableHash;
      sequence += 1;
    }
  }

  await TaskModel.updateMany(
    { basePriority: { $exists: false } },
    [
      {
        $set: {
          basePriority: "$priority",
          dynamicPriority: "$priority",
          urgencyScore: { $ifNull: ["$urgencyScore", 0] },
          impactScore: { $ifNull: ["$impactScore", 0] },
          dependencyWeight: { $ifNull: ["$dependencyWeight", 0] },
          dynamicPriorityScore: { $ifNull: ["$dynamicPriorityScore", 0] },
          priorityEscalatedAt: { $ifNull: ["$priorityEscalatedAt", null] },
          priorityEscalationReason: {
            $ifNull: ["$priorityEscalationReason", ""],
          },
        },
      },
    ],
    { updatePipeline: true },
  ).exec();

  await disconnectDatabase();
};

void run().catch(async (error) => {
  console.error(error);
  await disconnectDatabase();
  process.exit(1);
});
