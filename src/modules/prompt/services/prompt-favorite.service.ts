import PromptFavoriteModel from "../models/prompt-favorite.model.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import workspaceService from "../../workspace/services/workspace.service.js";

import { HttpError } from "../../../shared/errors/http-error.js";

export class PromptFavoriteService {
  public async toggleFavorite(
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

    const existingFav = await PromptFavoriteModel.findOne({
      workspaceId,
      userId,
      promptId: rootId,
    });

    if (existingFav) {
      await PromptFavoriteModel.deleteOne({ _id: existingFav._id });
      return { isFavorite: false };
    } else {
      await PromptFavoriteModel.create({
        workspaceId,
        userId,
        promptId: rootId,
      });
      return { isFavorite: true };
    }
  }
}

export default new PromptFavoriteService();
