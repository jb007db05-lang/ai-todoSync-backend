import accessService, { can } from "../../access/access.service.js";
import type { PermissionKey } from "../../access/permissions.js";
import { HttpError } from "../../../shared/errors/http-error.js";

export { HttpError };

interface PromptLike {
  _id: unknown;
  parentId?: unknown;
  workspaceId?: unknown;
  projectId?: unknown;
  visibility?: string;
  createdBy?: unknown;
}

const creatorOf = (prompt: PromptLike): string =>
  typeof prompt.createdBy === "object" &&
  prompt.createdBy !== null &&
  "_id" in prompt.createdBy
    ? String((prompt.createdBy as { _id: unknown })._id)
    : String(prompt.createdBy ?? "");

/**
 * Who may open, edit and link prompts. Visibility rules live in
 * accessService (shared with the list query); this adds the permission flags
 * and turns failures into HTTP errors.
 */
export class PromptAuthorizationService {
  /**
   * Opening a prompt: it must be in this workspace (else 404), visible to
   * the member, and they need `prompt.access` unless they wrote it.
   */
  public assertPromptAccess = async (
    prompt: PromptLike | null | undefined,
    userId: string,
    workspaceId: string,
    permission: PermissionKey = "prompt.access",
  ): Promise<void> => {
    if (!prompt) throw new HttpError(404, "Prompt not found.");
    if (
      prompt.workspaceId &&
      String(prompt.workspaceId) !== String(workspaceId)
    ) {
      throw new HttpError(404, "Prompt not found.");
    }
    const access = await accessService.resolve(userId, workspaceId);
    const visible = await accessService.canSeePrompt(access, {
      ...prompt,
      workspaceId: prompt.workspaceId ?? workspaceId,
    });
    if (!visible) {
      throw new HttpError(
        403,
        prompt.visibility === "private"
          ? "This is a private prompt. Ask its owner to share it with you."
          : "You don't have access to this prompt.",
      );
    }
    if (creatorOf(prompt) !== userId && !can(access, permission)) {
      throw new HttpError(403, `You need the "${permission}" permission.`);
    }
  };

  /** Editing or deleting: the author or a workspace admin, with `prompt.create`. */
  public assertCanEdit = async (
    prompt: PromptLike | null | undefined,
    userId: string,
    workspaceId: string,
  ): Promise<void> => {
    await this.assertPromptAccess(prompt, userId, workspaceId);
    const access = await accessService.resolve(userId, workspaceId);
    if (!access.isAdmin && creatorOf(prompt!) !== userId) {
      throw new HttpError(
        403,
        "Only the prompt's author or an admin can change it.",
      );
    }
    if (!can(access, "prompt.create")) {
      throw new HttpError(403, 'You need the "Create prompts" permission.');
    }
  };

  /**
   * Linking a prompt to a project needs `prompt.add_to_project` and access to
   * that project (a project in another workspace is reported as missing).
   */
  public assertCanAttachProject = async (
    userId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<void> => {
    const access = await accessService.resolve(userId, workspaceId);
    if (!can(access, "prompt.add_to_project")) {
      throw new HttpError(
        403,
        'You need the "Attach prompts to projects" permission.',
      );
    }
    await accessService.assertProject(access, projectId);
  };
}

export default new PromptAuthorizationService();
