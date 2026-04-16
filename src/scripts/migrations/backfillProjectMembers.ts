import { connectDatabase, disconnectDatabase } from "../../config/db.config.js";
import logger from "../../lib/logger.js";
import ProjectModel from "../../models/project.model.js";
import ProjectMemberModel from "../../models/project-member.model.js";

const backfillProjectMembers = async (): Promise<void> => {
  await connectDatabase();

  try {
    const projects = await ProjectModel.find({})
      .select({ _id: 1, userId: 1 })
      .lean()
      .exec();

    let createdCount = 0;

    for (const project of projects) {
      const result = await ProjectMemberModel.updateOne(
        {
          projectId: project._id,
          userId: project.userId,
        },
        {
          $setOnInsert: {
            role: "ADMIN",
          },
        },
        {
          upsert: true,
        },
      ).exec();

      if (result.upsertedCount > 0) {
        createdCount += 1;
      }
    }

    logger.info("Project member backfill complete", {
      scannedProjects: projects.length,
      createdMemberships: createdCount,
    });
  } finally {
    await disconnectDatabase();
  }
};

void backfillProjectMembers().catch((error) => {
  logger.error(
    "Project member backfill failed",
    error instanceof Error ? error : new Error("Unknown backfill error"),
  );
  process.exit(1);
});
