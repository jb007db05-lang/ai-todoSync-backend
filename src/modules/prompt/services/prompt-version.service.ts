import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import workspaceService from "../../workspace/services/workspace.service.js";

import { HttpError } from "../../../shared/errors/http-error.js";

export class PromptVersionService {
  public async getPromptVersions(
    workspaceId: string,
    userId: string,
    promptId: string,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const prompt = await PromptLibraryModel.findOne({
      _id: promptId,
      workspaceId,
    });
    if (!prompt) {
      throw new HttpError(404, "Prompt not found.");
    }
    await promptAuthorizationService.assertPromptAccess(
      prompt,
      userId,
      workspaceId,
    );

    const rootId = prompt.parentId || prompt._id;

    return PromptVersionModel.find({ promptId: rootId })
      .sort({ version: -1 })
      .populate("changedBy", "name email avatar")
      .lean();
  }

  public async comparePromptVersions(
    workspaceId: string,
    userId: string,
    promptId: string,
    v1: number,
    v2: number,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const prompt = await PromptLibraryModel.findOne({
      _id: promptId,
      workspaceId,
    });
    if (!prompt) {
      throw new HttpError(404, "Prompt not found.");
    }
    await promptAuthorizationService.assertPromptAccess(
      prompt,
      userId,
      workspaceId,
    );

    const rootId = prompt.parentId || prompt._id;

    const [ver1, ver2] = await Promise.all([
      PromptVersionModel.findOne({ promptId: rootId, version: v1 }).lean(),
      PromptVersionModel.findOne({ promptId: rootId, version: v2 }).lean(),
    ]);

    if (!ver1 || !ver2) {
      throw new HttpError(
        404,
        "One or both specified versions were not found.",
      );
    }

    return {
      v1: ver1,
      v2: ver2,
      hashMatch: ver1.hash === ver2.hash,
    };
  }
}

export default new PromptVersionService();
