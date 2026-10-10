import { connectDatabase, disconnectDatabase } from "../../config/db.config.js";
import logger from "../../lib/logger.js";
import ProjectModel from "../../modules/project/models/project.model.js";
import ProjectMemberModel from "../../modules/project/models/project-member.model.js";
import WorkspaceMemberModel from "../../modules/workspace/models/workspace-member.model.js";
import accessService from "../../modules/access/access.service.js";

/**
 * Brings existing data under workspace isolation without anyone losing
 * access (idempotent; safe to run repeatedly):
 *
 * 1. Every project gets a workspace: projects without one move into their
 *    creator's default workspace.
 * 2. Every project member becomes a member of the project's workspace (as
 *    MEMBER with role defaults), because project access now requires it.
 *
 *   npm run migrate:workspace-isolation        (add -- --dry to preview)
 */
const dryRun = process.argv.includes("--dry");

const backfillWorkspaceIsolation = async (): Promise<void> => {
  await connectDatabase();

  try {
    let projectsMoved = 0;
    let membersAdded = 0;

    const orphans = await ProjectModel.find({
      $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }],
    }).exec();
    for (const project of orphans) {
      if (!dryRun) await accessService.projectWorkspaceId(project);
      projectsMoved += 1;
    }

    const projects = await ProjectModel.find({ workspaceId: { $ne: null } })
      .select({ _id: 1, workspaceId: 1 })
      .lean()
      .exec();
    for (const project of projects) {
      const members = await ProjectMemberModel.find({ projectId: project._id })
        .select({ userId: 1 })
        .lean()
        .exec();
      for (const member of members) {
        const exists = await WorkspaceMemberModel.exists({
          workspaceId: project.workspaceId,
          userId: member.userId,
        });
        if (exists) continue;
        membersAdded += 1;
        if (!dryRun) {
          await accessService.ensureWorkspaceMember(
            String(project.workspaceId),
            String(member.userId),
          );
        }
      }
    }

    logger.info(
      `Workspace isolation backfill ${dryRun ? "(dry run) " : ""}complete`,
      {
        projectsMovedIntoWorkspaces: projectsMoved,
        workspaceMembershipsAdded: membersAdded,
      },
    );
  } finally {
    await disconnectDatabase();
  }
};

void backfillWorkspaceIsolation().catch((error) => {
  logger.error(
    "Workspace isolation backfill failed",
    error instanceof Error ? error : new Error("Unknown backfill error"),
  );
  process.exit(1);
});
