import PromptFolderModel from "../models/prompt-folder.model.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import { runInTransaction } from "../../../utils/transaction.js";

import { HttpError } from "../../../shared/errors/http-error.js";

export class PromptFolderService {
  public async createFolder(
    workspaceId: string,
    userId: string,
    payload: { name: string; description?: string; parentId?: string | null },
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    if (!payload.name || !payload.name.trim()) {
      throw new HttpError(400, "Folder name is required.");
    }

    if (payload.parentId) {
      const parent = await PromptFolderModel.findOne({
        _id: payload.parentId,
        workspaceId,
      });
      if (!parent) {
        throw new HttpError(
          400,
          "Parent folder does not exist in this workspace.",
        );
      }
    }

    const folder = await PromptFolderModel.create({
      workspaceId,
      name: payload.name.trim(),
      description: payload.description || "",
      parentId: payload.parentId || null,
      createdBy: userId,
    });
    return folder;
  }

  public async listFolders(workspaceId: string, userId: string) {
    await workspaceService.assertMembership(userId, workspaceId);
    return PromptFolderModel.find({ workspaceId }).sort({ name: 1 }).lean();
  }

  public async updateFolder(
    workspaceId: string,
    userId: string,
    folderId: string,
    payload: { name?: string; description?: string; parentId?: string | null },
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const folder = await PromptFolderModel.findOne({
      _id: folderId,
      workspaceId,
    });
    if (!folder) {
      throw new HttpError(404, "Folder not found.");
    }

    if (payload.parentId !== undefined && payload.parentId !== null) {
      if (String(payload.parentId) === String(folderId)) {
        throw new HttpError(400, "Folder cannot be its own parent.");
      }

      const parentFolder = await PromptFolderModel.findOne({
        _id: payload.parentId,
        workspaceId,
      });
      if (!parentFolder) {
        throw new HttpError(
          400,
          "Target parent folder does not exist in this workspace.",
        );
      }

      let currentParent: any = parentFolder;
      while (currentParent && currentParent.parentId) {
        if (String(currentParent.parentId) === String(folderId)) {
          throw new HttpError(
            400,
            "Circular folder hierarchy relationship rejected.",
          );
        }
        currentParent = await PromptFolderModel.findOne({
          _id: currentParent.parentId,
          workspaceId,
        });
      }
      folder.parentId = payload.parentId as any;
    } else if (payload.parentId === null) {
      folder.parentId = null;
    }

    if (payload.name !== undefined) folder.name = payload.name.trim();
    if (payload.description !== undefined)
      folder.description = payload.description;

    await folder.save();
    return folder;
  }

  public async deleteFolder(
    workspaceId: string,
    userId: string,
    folderId: string,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const folder = await PromptFolderModel.findOne({
      _id: folderId,
      workspaceId,
    });
    if (!folder) {
      throw new HttpError(404, "Folder not found.");
    }

    await runInTransaction(async (session) => {
      await PromptLibraryModel.updateMany(
        { workspaceId, folderId },
        { $set: { folderId: null } },
        { session },
      );

      await PromptFolderModel.updateMany(
        { workspaceId, parentId: folderId },
        { $set: { parentId: folder.parentId || null } },
        { session },
      );

      await PromptFolderModel.deleteOne(
        { _id: folderId, workspaceId },
        { session },
      );
    });

    return { success: true };
  }
}

export default new PromptFolderService();
