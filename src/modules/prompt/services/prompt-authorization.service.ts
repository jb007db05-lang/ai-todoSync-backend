import ProjectModel from "../../project/models/project.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import { HttpError } from "../../../shared/errors/http-error.js";

export { HttpError };

export class PromptAuthorizationService {
  public assertPromptAccess = async (
    prompt: any,
    userId: string,
    workspaceId: string,
  ): Promise<void> => {
    if (!prompt) {
      throw new HttpError(404, "Prompt not found.");
    }
    if (
      prompt.workspaceId &&
      String(prompt.workspaceId) !== String(workspaceId)
    ) {
      throw new HttpError(403, "Cross-workspace access denied.");
    }

    const creatorId = prompt.createdBy
      ? typeof prompt.createdBy === "object" && "_id" in prompt.createdBy
        ? String(prompt.createdBy._id)
        : String(prompt.createdBy)
      : "";

    if (prompt.visibility === "private") {
      if (creatorId !== userId) {
        throw new HttpError(403, "Access denied to private prompt.");
      }
    } else if (prompt.visibility === "project") {
      if (prompt.projectId) {
        const project = await ProjectModel.findOne({
          _id: prompt.projectId,
          workspaceId,
        });
        if (!project) {
          throw new HttpError(
            403,
            "Access denied. Associated project does not exist in this workspace.",
          );
        }
        const projectOwnerId = String(project.userId);
        if (creatorId !== userId && projectOwnerId !== userId) {
          await workspaceService.assertMembership(userId, workspaceId);
        }
      }
    }
  };
}

export default new PromptAuthorizationService();
