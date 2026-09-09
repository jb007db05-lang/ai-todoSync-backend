import crypto from "crypto";
import type { Types } from "mongoose";
import PromptLibraryModel, {
  type IPromptLibrary,
  type IPromptMessage,
  type IPromptVariable,
} from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import PromptFolderModel from "../models/prompt-folder.model.js";
import workspaceService from "./workspace.service.js";

export class HttpError extends Error {
  public status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export interface CreatePromptPayload {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  body: string;
  messages?: IPromptMessage[];
  variables?: IPromptVariable[];
  folderId?: string | null;
  visibility?: "private" | "project" | "organization";
  isTemplate?: boolean;
}

export interface UpdatePromptPayload {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  body?: string;
  messages?: IPromptMessage[];
  variables?: IPromptVariable[];
  folderId?: string | null;
  visibility?: "private" | "project" | "organization";
  changeNote?: string;
}

class PromptLibraryService {
  /**
   * Automatically detect Handlebars variables like {{variable_name}} from text content
   */
  public extractHandlebarsVariables(text: string): string[] {
    if (!text) return [];
    const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const matches = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        matches.add(match[1].trim());
      }
    }
    return Array.from(matches);
  }

  /**
   * Merge auto-detected variables with existing variable schemas
   */
  public syncVariables(
    bodyText: string,
    messages: IPromptMessage[] = [],
    providedVariables: IPromptVariable[] = [],
  ): IPromptVariable[] {
    const combinedContent = [bodyText, ...messages.map((m) => m.content)].join(
      "\n",
    );
    const detectedNames = this.extractHandlebarsVariables(combinedContent);

    const variableMap = new Map<string, IPromptVariable>();

    // First populate from provided variables
    for (const v of providedVariables) {
      if (v.name && v.name.trim()) {
        const cleanName = v.name.trim();
        variableMap.set(cleanName, {
          name: cleanName,
          type: v.type || "string",
          description: v.description || "",
          defaultValue: v.defaultValue || "",
          required: v.required ?? true,
          options: v.options || [],
        });
      }
    }

    // Add any auto-detected variables that weren't in providedVariables
    for (const name of detectedNames) {
      if (!variableMap.has(name)) {
        variableMap.set(name, {
          name,
          type: "string",
          description: `Auto-detected variable: ${name}`,
          defaultValue: "",
          required: true,
        });
      }
    }

    return Array.from(variableMap.values());
  }

  /**
   * Generate canonical SHA-256 content hash for version immutability verification
   */
  public generateCanonicalHash(
    body: string,
    messages: IPromptMessage[] = [],
    variables: IPromptVariable[] = [],
  ): string {
    const canonicalObj = {
      body: body.trim(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content.trim(),
      })),
      variables: variables
        .map((v) => ({
          name: v.name.trim(),
          type: v.type || "string",
          required: v.required ?? true,
          defaultValue: v.defaultValue || "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(canonicalObj))
      .digest("hex");
  }

  /**
   * Generate clean slug from prompt name
   */
  public generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
  }

  // --- Folder Operations ---

  public async createFolder(
    workspaceId: string,
    userId: string,
    payload: { name: string; description?: string; parentId?: string | null },
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    if (!payload.name || !payload.name.trim()) {
      throw new HttpError(400, "Folder name is required.");
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

  public async deleteFolder(
    workspaceId: string,
    userId: string,
    folderId: string,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    await PromptLibraryModel.updateMany(
      { workspaceId, folderId },
      { $set: { folderId: null } },
    );
    await PromptFolderModel.deleteOne({ _id: folderId, workspaceId });
    return { success: true };
  }

  // --- Prompt Operations ---

  public async listPrompts(
    workspaceId: string,
    userId: string,
    options: {
      category?: string;
      folderId?: string;
      search?: string;
      isTemplate?: boolean;
      isFavorite?: boolean;
    } = {},
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const filter: Record<string, any> = {
      workspaceId,
      isLatest: true,
      isArchived: false,
    };

    if (options.category) filter.category = options.category;
    if (options.folderId !== undefined) {
      filter.folderId = options.folderId === "null" ? null : options.folderId;
    }
    if (options.isTemplate !== undefined)
      filter.isTemplate = options.isTemplate;
    if (options.isFavorite !== undefined)
      filter.isFavorite = options.isFavorite;

    if (options.search && options.search.trim()) {
      const searchRegex = new RegExp(options.search.trim(), "i");
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
        { body: searchRegex },
      ];
    }

    return PromptLibraryModel.find(filter)
      .sort({ updatedAt: -1 })
      .populate("createdBy", "name email avatar")
      .lean();
  }

  public async getPromptDetails(
    workspaceId: string,
    userId: string,
    promptId: string,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const prompt = await PromptLibraryModel.findOne({
      _id: promptId,
      workspaceId,
    })
      .populate("createdBy", "name email avatar")
      .lean();

    if (!prompt) {
      throw new HttpError(404, "Prompt not found.");
    }
    return prompt;
  }

  public async createPrompt(
    workspaceId: string,
    userId: string,
    payload: CreatePromptPayload,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    if (!payload.name || !payload.name.trim()) {
      throw new HttpError(400, "Prompt name is required.");
    }

    const bodyText = payload.body || "";
    const messages = payload.messages || [];
    const syncedVariables = this.syncVariables(
      bodyText,
      messages,
      payload.variables,
    );
    const hash = this.generateCanonicalHash(
      bodyText,
      messages,
      syncedVariables,
    );
    const slug = this.generateSlug(payload.name);

    const prompt = await PromptLibraryModel.create({
      workspaceId,
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
    });

    // Create corresponding PromptVersion record for v1
    await PromptVersionModel.create({
      promptId: prompt._id,
      version: 1,
      hash,
      body: bodyText,
      messages,
      variables: syncedVariables,
      changedBy: userId,
      changeNote: "Initial prompt creation (v1)",
    });

    return prompt;
  }

  public async updatePrompt(
    workspaceId: string,
    userId: string,
    promptId: string,
    payload: UpdatePromptPayload,
  ) {
    await workspaceService.assertMembership(userId, workspaceId);
    const existing = await PromptLibraryModel.findOne({
      _id: promptId,
      workspaceId,
    });

    if (!existing) {
      throw new HttpError(404, "Prompt not found.");
    }

    const rootPromptId = existing.parentId || existing._id;

    // Check if body, messages, or variables content changed
    const newBody = payload.body !== undefined ? payload.body : existing.body;
    const newMessages =
      payload.messages !== undefined
        ? payload.messages
        : existing.messages || [];
    const syncedVars = this.syncVariables(
      newBody,
      newMessages,
      payload.variables !== undefined ? payload.variables : existing.variables,
    );

    const newHash = this.generateCanonicalHash(
      newBody,
      newMessages,
      syncedVars,
    );
    const contentChanged = newHash !== existing.hash;

    if (contentChanged) {
      // Content changed -> Bump version!
      const newVersionNum = existing.version + 1;

      // Mark old version as not latest
      await PromptLibraryModel.updateOne(
        { _id: existing._id },
        { $set: { isLatest: false } },
      );

      // Create new version doc
      const updatedPrompt = await PromptLibraryModel.create({
        workspaceId,
        parentId: rootPromptId,
        name: payload.name !== undefined ? payload.name.trim() : existing.name,
        slug:
          payload.name !== undefined
            ? this.generateSlug(payload.name)
            : existing.slug,
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
          payload.folderId !== undefined ? payload.folderId : existing.folderId,
        visibility: payload.visibility || existing.visibility,
        createdBy: userId,
        version: newVersionNum,
        hash: newHash,
        isLatest: true,
      });

      // Save version audit history log
      await PromptVersionModel.create({
        promptId: rootIdOrSelf(existing),
        version: newVersionNum,
        hash: newHash,
        body: newBody,
        messages: newMessages,
        variables: syncedVars,
        changedBy: userId,
        changeNote: payload.changeNote || `Updated prompt to v${newVersionNum}`,
      });

      return updatedPrompt;
    } else {
      // Metadata update only (name, description, tags, folder) without content change
      if (payload.name !== undefined) existing.name = payload.name.trim();
      if (payload.description !== undefined)
        existing.description = payload.description;
      if (payload.category) existing.category = payload.category as any;
      if (payload.tags !== undefined)
        existing.tags = payload.tags.map((t) => t.toLowerCase().trim());
      if (payload.folderId !== undefined)
        existing.folderId = payload.folderId as any;
      if (payload.visibility) existing.visibility = payload.visibility as any;

      await existing.save();
      return existing;
    }
  }

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
    prompt.isFavorite = !prompt.isFavorite;
    await prompt.save();
    return { isFavorite: prompt.isFavorite };
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
    prompt.isArchived = true;
    await prompt.save();
    return { success: true };
  }
}

function rootIdOrSelf(doc: any) {
  return doc.parentId || doc._id;
}

export default new PromptLibraryService();
