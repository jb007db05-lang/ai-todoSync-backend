import PromptFolderModel from "../models/prompt-folder.model.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import ProjectModel from "../../project/models/project.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import { runInTransaction } from "../../../utils/transaction.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import promptVariableService from "./prompt-variable.service.js";
import promptHashService from "./prompt-hash.service.js"; // note .js extension for node module
import promptFolderService from "./prompt-folder.service.js";
import promptFavoriteService from "./prompt-favorite.service.js";
import promptVersionService from "./prompt-version.service.js";
import promptQueryService from "./prompt-query.service.js";
import type {
  CreatePromptPayload,
  UpdatePromptPayload,
} from "../../../interfaces/prompt/prompt.interface.js";

import { HttpError } from "../../../shared/errors/http-error.js";

export { HttpError };

export class PromptService {
  // Delegate helper methods for backward-compatibility
  public validateVariableSchema = promptVariableService.validateVariableSchema;
  public assertPromptAccess = promptAuthorizationService.assertPromptAccess;
  public extractHandlebarsVariables =
    promptVariableService.extractHandlebarsVariables;
  public syncVariables = promptVariableService.syncVariables;
  public validateVariableValues = promptVariableService.validateVariableValues;
  public substituteVariables = promptVariableService.substituteVariables;
  public generateCanonicalHash = promptHashService.generateCanonicalHash;
  public generateSlug = promptHashService.generateSlug;

  // Folder Operations
  public createFolder = promptFolderService.createFolder;
  public listFolders = promptFolderService.listFolders;
  public updateFolder = promptFolderService.updateFolder;
  public deleteFolder = promptFolderService.deleteFolder;

  // Query Operations
  public listPrompts = promptQueryService.listPrompts;
  public getPromptDetails = promptQueryService.getPromptDetails;

  // Favorite & Version Operations
  public toggleFavorite = promptFavoriteService.toggleFavorite;
  public getPromptVersions = promptVersionService.getPromptVersions;
  public comparePromptVersions = promptVersionService.comparePromptVersions;

  // Core Prompt CRUD Operations
  public async createPrompt(
    workspaceId: string,
    userId: string,
    payload: CreatePromptPayload,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    if (!payload.name || !payload.name.trim()) {
      throw new HttpError(400, "Prompt name is required.");
    }

    if (payload.folderId) {
      const folder = await PromptFolderModel.findOne({
        _id: payload.folderId,
        workspaceId,
      });
      if (!folder) {
        throw new HttpError(400, "Folder does not exist in this workspace.");
      }
    }

    if (payload.projectId) {
      const project = await ProjectModel.findOne({
        _id: payload.projectId,
        workspaceId,
      });
      if (!project) {
        throw new HttpError(400, "Project does not exist in this workspace.");
      }
    }

    const bodyText = payload.body || "";
    const messages = payload.messages || [];
    const syncedVariables = promptVariableService.syncVariables(
      bodyText,
      messages,
      payload.variables,
    );
    const hash = promptHashService.generateCanonicalHash(
      bodyText,
      messages,
      syncedVariables,
    );
    const slug = promptHashService.generateSlug(payload.name);

    const existingSlug = await PromptLibraryModel.findOne({
      workspaceId,
      slug,
      isLatest: true,
    });
    if (existingSlug) {
      throw new HttpError(
        400,
        `A prompt with slug '${slug}' already exists in this workspace.`,
      );
    }

    try {
      return await runInTransaction(async (session) => {
        const promptDocs = await PromptLibraryModel.create(
          [
            {
              workspaceId,
              projectId: payload.projectId || null,
              name: payload.name.trim(),
              slug,
              description: payload.description || "",
              category: payload.category || "general",
              tags: (payload.tags || []).map((t) => t.toLowerCase().trim()),
              body: bodyText,
              messages,
              variables: syncedVariables,
              folderId: payload.folderId || null,
              visibility: payload.visibility || "organization",
              createdBy: userId,
              version: 1,
              hash,
              isLatest: true,
              isTemplate: payload.isTemplate || false,
            },
          ],
          { session },
        );

        const prompt = promptDocs[0];

        await PromptVersionModel.create(
          [
            {
              promptId: prompt._id,
              version: 1,
              hash,
              body: bodyText,
              messages,
              variables: syncedVariables,
              changedBy: userId,
              changeNote: "Initial prompt creation (v1)",
            },
          ],
          { session },
        );

        return prompt;
      });
    } catch (err: any) {
      if (err.code === 11000 && err.keyPattern?.slug) {
        throw new HttpError(
          400,
          `A prompt with slug '${slug}' already exists in this workspace.`,
        );
      }
      throw err;
    }
  }

  public async updatePrompt(
    workspaceId: string,
    userId: string,
    promptId: string,
    payload: UpdatePromptPayload,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);

    return runInTransaction(async (session) => {
      const targetPrompt = await PromptLibraryModel.findOne({
        _id: promptId,
        workspaceId,
      }).session(session || null);

      if (!targetPrompt) {
        throw new HttpError(404, "Prompt not found.");
      }

      await promptAuthorizationService.assertPromptAccess(
        targetPrompt,
        userId,
        workspaceId,
      );

      if (!targetPrompt.isLatest) {
        throw new HttpError(
          400,
          "Historical prompt revisions are immutable. Update the current logical prompt/revision instead.",
        );
      }

      const rootPromptId = targetPrompt.parentId || targetPrompt._id;
      let existing = targetPrompt;

      if (payload.folderId !== undefined && payload.folderId !== null) {
        const folder = await PromptFolderModel.findOne({
          _id: payload.folderId,
          workspaceId,
        }).session(session || null);
        if (!folder) {
          throw new HttpError(400, "Folder does not exist in this workspace.");
        }
      }

      if (payload.projectId !== undefined && payload.projectId !== null) {
        const project = await ProjectModel.findOne({
          _id: payload.projectId,
          workspaceId,
        }).session(session || null);
        if (!project) {
          throw new HttpError(400, "Project does not exist in this workspace.");
        }
      }

      const newBody = payload.body !== undefined ? payload.body : existing.body;
      const newMessages =
        payload.messages !== undefined
          ? payload.messages
          : existing.messages || [];
      const syncedVars = promptVariableService.syncVariables(
        newBody,
        newMessages,
        payload.variables !== undefined
          ? payload.variables
          : existing.variables,
      );

      const newHash = promptHashService.generateCanonicalHash(
        newBody,
        newMessages,
        syncedVars,
      );
      const contentChanged = newHash !== existing.hash;

      if (contentChanged) {
        const latestVersionRecord = await PromptVersionModel.findOne({
          promptId: rootPromptId,
        })
          .sort({ version: -1 })
          .session(session || null);

        const newVersionNum =
          (latestVersionRecord?.version || existing.version) + 1;

        const updateRes = await PromptLibraryModel.updateOne(
          { _id: existing._id, isLatest: true },
          { $set: { isLatest: false } },
          { session },
        );

        if (updateRes.modifiedCount === 0) {
          const freshActive = await PromptLibraryModel.findOne({
            workspaceId,
            isLatest: true,
            $or: [{ _id: rootPromptId }, { parentId: rootPromptId }],
          }).session(session || null);

          if (freshActive) {
            existing = freshActive;
            await PromptLibraryModel.updateOne(
              { _id: existing._id, isLatest: true },
              { $set: { isLatest: false } },
            );
          }
        }

        const stableSlug =
          existing.slug || promptHashService.generateSlug(existing.name);

        const updatedPromptDocs = await PromptLibraryModel.create(
          [
            {
              workspaceId,
              parentId: rootPromptId,
              projectId:
                payload.projectId !== undefined
                  ? payload.projectId
                  : existing.projectId,
              name:
                payload.name !== undefined
                  ? payload.name.trim()
                  : existing.name,
              slug: stableSlug,
              description:
                payload.description !== undefined
                  ? payload.description
                  : existing.description,
              category: payload.category || existing.category,
              tags:
                payload.tags !== undefined
                  ? payload.tags.map((t) => t.toLowerCase().trim())
                  : existing.tags,
              body: newBody,
              messages: newMessages,
              variables: syncedVars,
              folderId:
                payload.folderId !== undefined
                  ? payload.folderId
                  : existing.folderId,
              visibility: payload.visibility || existing.visibility,
              createdBy: userId,
              version: newVersionNum,
              hash: newHash,
              isLatest: true,
            },
          ],
          { session },
        );

        const updatedPrompt = updatedPromptDocs[0];

        await PromptVersionModel.create(
          [
            {
              promptId: rootPromptId,
              version: newVersionNum,
              hash: newHash,
              body: newBody,
              messages: newMessages,
              variables: syncedVars,
              changedBy: userId,
              changeNote:
                payload.changeNote || `Updated prompt to v${newVersionNum}`,
            },
          ],
          { session },
        );

        return updatedPrompt;
      } else {
        if (payload.name !== undefined) existing.name = payload.name.trim();
        if (payload.description !== undefined)
          existing.description = payload.description;
        if (payload.category) existing.category = payload.category;
        if (payload.tags !== undefined)
          existing.tags = payload.tags.map((t) => t.toLowerCase().trim());
        if (payload.folderId !== undefined)
          existing.folderId = payload.folderId as any;
        if (payload.projectId !== undefined)
          existing.projectId = payload.projectId as any;
        if (payload.visibility) existing.visibility = payload.visibility;

        await existing.save({ session: session || undefined });
        return existing;
      }
    });
  }

  public async deletePrompt(
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
    await PromptLibraryModel.updateMany(
      { workspaceId, $or: [{ _id: rootId }, { parentId: rootId }] },
      { $set: { isArchived: true } },
    );
    return { success: true };
  }
}

export default new PromptService();
