import mongoose from "mongoose";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptMemberAccessModel from "../../access/prompt-member-access.model.js";
import accessService from "../../access/access.service.js";
import WorkspaceMemberModel from "../../workspace/models/workspace-member.model.js";
import ProjectMemberModel from "../../project/models/project-member.model.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import { HttpError } from "../../../shared/errors/http-error.js";

/**
 * Individual prompt grants: "this teammate may open this prompt". Granting
 * needs `prompt.share_individual` and access to the prompt yourself. For a
 * prompt linked to a project the teammate must be able to open that project.
 */
class PromptSharingService {
  public async listAccess(
    workspaceId: string,
    userId: string,
    promptId: string,
  ) {
    if (
      !promptId ||
      promptId === "undefined" ||
      !mongoose.Types.ObjectId.isValid(promptId)
    ) {
      return [];
    }
    const prompt = await this.loadSharable(workspaceId, userId, promptId);
    const root = this.rootId(prompt);
    if (!root) return [];
    const grants = await PromptMemberAccessModel.find({
      promptId: root,
    })
      .sort({ grantedAt: -1 })
      .populate("userId", "name email")
      .populate("grantedBy", "name email")
      .lean();
    return grants.map((g: any) => ({
      id: String(g._id),
      userId: String(g.userId?._id ?? g.userId),
      name: g.userId?.name ?? null,
      email: g.userId?.email ?? "",
      grantedBy: g.grantedBy?.name || g.grantedBy?.email || null,
      grantedAt: g.grantedAt,
    }));
  }

  public async grant(
    workspaceId: string,
    userId: string,
    promptId: string,
    targetUserId: unknown,
  ) {
    if (
      typeof targetUserId !== "string" ||
      !/^[a-f0-9]{24}$/i.test(targetUserId)
    ) {
      throw new HttpError(400, "userId must be a teammate's id.");
    }
    const prompt = await this.loadSharable(workspaceId, userId, promptId);
    if (targetUserId === userId) {
      throw new HttpError(400, "You already have access to this prompt.");
    }
    const isMember = await WorkspaceMemberModel.exists({
      workspaceId,
      userId: targetUserId,
    });
    if (!isMember)
      throw new HttpError(404, "Teammate not found in this workspace.");
    if (prompt.projectId) {
      const inProject = await ProjectMemberModel.exists({
        projectId: prompt.projectId,
        userId: targetUserId,
      });
      const target = await accessService.resolve(targetUserId, workspaceId);
      if (!inProject && !target.isAdmin) {
        throw new HttpError(
          400,
          "Give this teammate access to the prompt's project first.",
        );
      }
    }
    await PromptMemberAccessModel.updateOne(
      { promptId: this.rootId(prompt), userId: targetUserId },
      {
        $setOnInsert: {
          workspaceId,
          promptId: this.rootId(prompt),
          userId: targetUserId,
          grantedBy: userId,
          grantedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return this.listAccess(workspaceId, userId, promptId);
  }

  public async revoke(
    workspaceId: string,
    userId: string,
    promptId: string,
    targetUserId: string,
  ) {
    const prompt = await this.loadSharable(workspaceId, userId, promptId);
    await PromptMemberAccessModel.deleteOne({
      promptId: this.rootId(prompt),
      userId: targetUserId,
    });
    return this.listAccess(workspaceId, userId, promptId);
  }

  private async loadSharable(
    workspaceId: string,
    userId: string,
    promptId: string,
  ) {
    const prompt = /^[a-f0-9]{24}$/i.test(promptId)
      ? await PromptLibraryModel.findOne({ _id: promptId, workspaceId }).lean()
      : null;
    await promptAuthorizationService.assertPromptAccess(
      prompt,
      userId,
      workspaceId,
    );
    // Sharing always needs the flag, even for the prompt's author.
    accessService.require(
      await accessService.resolve(userId, workspaceId),
      "prompt.share_individual",
    );
    return prompt!;
  }

  /** Grants target the prompt's root id so they cover every version. */
  private rootId(prompt: {
    _id?: unknown;
    parentId?: unknown;
    id?: unknown;
  }): string {
    const raw = prompt.parentId ?? prompt._id ?? prompt.id;
    if (!raw) {
      throw new HttpError(400, "Invalid prompt identifier.");
    }
    const str = String(raw);
    if (!str || str === "undefined" || !mongoose.Types.ObjectId.isValid(str)) {
      throw new HttpError(400, "Invalid prompt identifier.");
    }
    return str;
  }
}

export default new PromptSharingService();
