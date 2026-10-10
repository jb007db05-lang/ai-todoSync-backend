import type { Response, NextFunction } from "express";
import mongoose from "mongoose";
import type { AuthenticatedRequest } from "../../../types/auth.js";
import promptLibraryService, { HttpError } from "../services/prompt.service.js";
import promptSharingService from "../services/prompt-sharing.service.js";

class PromptLibraryController {
  private getUserId(req: AuthenticatedRequest): string {
    const userId = req.user?._id?.toString();
    if (!userId) {
      throw new HttpError(401, "Authentication required.");
    }
    return userId;
  }

  private getParam(req: AuthenticatedRequest, key: string): string {
    const val = req.params[key];
    if (!val || typeof val !== "string" || val === "undefined") {
      throw new HttpError(400, `Missing required param '${key}'`);
    }
    if (
      (key === "promptId" || key === "workspaceId" || key === "folderId") &&
      !mongoose.Types.ObjectId.isValid(val)
    ) {
      throw new HttpError(400, `Invalid ID param '${key}'`);
    }
    return val;
  }

  private parseBooleanQuery(val: unknown): boolean | undefined {
    if (val === undefined || val === null || val === "") return undefined;
    if (val === "true" || val === true) return true;
    if (val === "false" || val === false) return false;
    return undefined;
  }

  // Individual sharing (prompt.share_individual)
  public listPromptAccess = async (
    req: AuthenticatedRequest,
    res: Response,
  ) => {
    const access = await promptSharingService.listAccess(
      this.getParam(req, "workspaceId"),
      this.getUserId(req),
      this.getParam(req, "promptId"),
    );
    res.status(200).json({ status: "success", data: access });
  };

  public grantPromptAccess = async (
    req: AuthenticatedRequest,
    res: Response,
  ) => {
    const access = await promptSharingService.grant(
      this.getParam(req, "workspaceId"),
      this.getUserId(req),
      this.getParam(req, "promptId"),
      req.body?.userId,
    );
    res.status(200).json({ status: "success", data: access });
  };

  public revokePromptAccess = async (
    req: AuthenticatedRequest,
    res: Response,
  ) => {
    const access = await promptSharingService.revoke(
      this.getParam(req, "workspaceId"),
      this.getUserId(req),
      this.getParam(req, "promptId"),
      this.getParam(req, "userId"),
    );
    res.status(200).json({ status: "success", data: access });
  };

  // Folders
  public createFolder = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");

      const folder = await promptLibraryService.createFolder(
        workspaceId,
        userId,
        req.body,
      );
      res.status(201).json({ status: "success", data: folder });
    } catch (err) {
      next(err);
    }
  };

  public listFolders = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");

      const folders = await promptLibraryService.listFolders(
        workspaceId,
        userId,
      );
      res.status(200).json({ status: "success", data: folders });
    } catch (err) {
      next(err);
    }
  };

  public updateFolder = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const folderId = this.getParam(req, "folderId");

      const folder = await promptLibraryService.updateFolder(
        workspaceId,
        userId,
        folderId,
        req.body,
      );
      res.status(200).json({ status: "success", data: folder });
    } catch (err) {
      next(err);
    }
  };

  public deleteFolder = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const folderId = this.getParam(req, "folderId");

      const result = await promptLibraryService.deleteFolder(
        workspaceId,
        userId,
        folderId,
      );
      res.status(200).json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  };

  // Prompts
  public listPrompts = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");

      const { category, folderId, search, isTemplate, isFavorite, projectId } =
        req.query;

      const prompts = await promptLibraryService.listPrompts(
        workspaceId,
        userId,
        {
          category: category as string,
          folderId: folderId as string,
          search: search as string,
          isTemplate: this.parseBooleanQuery(isTemplate),
          isFavorite: this.parseBooleanQuery(isFavorite),
          projectId: typeof projectId === "string" ? projectId : undefined,
        },
      );

      res.status(200).json({ status: "success", data: prompts });
    } catch (err) {
      next(err);
    }
  };

  public getPromptDetails = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const prompt = await promptLibraryService.getPromptDetails(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: prompt });
    } catch (err) {
      next(err);
    }
  };

  public createPrompt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");

      const prompt = await promptLibraryService.createPrompt(
        workspaceId,
        userId,
        req.body,
      );
      res.status(201).json({ status: "success", data: prompt });
    } catch (err) {
      next(err);
    }
  };

  public updatePrompt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const prompt = await promptLibraryService.updatePrompt(
        workspaceId,
        userId,
        promptId,
        req.body,
      );
      res.status(200).json({ status: "success", data: prompt });
    } catch (err) {
      next(err);
    }
  };

  public getPromptVersions = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const versions = await promptLibraryService.getPromptVersions(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: versions });
    } catch (err) {
      next(err);
    }
  };

  public comparePromptVersions = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const v1 = parseInt(req.query.v1 as string, 10);
      const v2 = parseInt(req.query.v2 as string, 10);

      if (isNaN(v1) || isNaN(v2)) {
        throw new HttpError(400, "Query params v1 and v2 must be numbers.");
      }

      const diff = await promptLibraryService.comparePromptVersions(
        workspaceId,
        userId,
        promptId,
        v1,
        v2,
      );
      res.status(200).json({ status: "success", data: diff });
    } catch (err) {
      next(err);
    }
  };

  public toggleFavorite = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const result = await promptLibraryService.toggleFavorite(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  };

  public validatePromptVariables = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const prompt = await promptLibraryService.getPromptDetails(
        workspaceId,
        userId,
        promptId,
      );

      const validated = promptLibraryService.validateVariableValues(
        prompt.variables,
        req.body.variables || {},
      );

      res.status(200).json({ status: "success", data: validated });
    } catch (err) {
      next(err);
    }
  };

  public renderPrompt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const prompt = await promptLibraryService.getPromptDetails(
        workspaceId,
        userId,
        promptId,
      );

      const target =
        prompt.messages && prompt.messages.length > 0
          ? prompt.messages
          : prompt.body;
      const rendered = promptLibraryService.substituteVariables(
        target,
        prompt.variables,
        req.body.variables || {},
      );

      res.status(200).json({ status: "success", data: rendered });
    } catch (err) {
      next(err);
    }
  };

  public deletePrompt = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const result = await promptLibraryService.deletePrompt(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  };

  public runPlayground = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const rawPromptId = req.params.promptId || req.body?.promptId;
      const cleanPromptId =
        rawPromptId &&
        rawPromptId !== "undefined" &&
        mongoose.Types.ObjectId.isValid(rawPromptId)
          ? rawPromptId
          : undefined;

      const payload = {
        ...req.body,
        promptId: cleanPromptId,
      };

      const result = await promptLibraryService.runPlayground(
        workspaceId,
        userId,
        payload,
      );
      res.status(200).json({ status: "success", data: result });
    } catch (err) {
      next(err);
    }
  };

  // Deployments (production / canary / feature binding)
  public listFeatures = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");

      const features = await promptLibraryService.listFeatures(
        workspaceId,
        userId,
      );
      res.status(200).json({ status: "success", data: features });
    } catch (err) {
      next(err);
    }
  };

  public getDeployment = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.getDeployment(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public setProductionVersion = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.setProductionVersion(
        workspaceId,
        userId,
        promptId,
        req.body?.version,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public startCanary = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.startCanary(
        workspaceId,
        userId,
        promptId,
        req.body?.version,
        req.body?.percentage,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public deployVersion = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.deployVersion(
        workspaceId,
        userId,
        promptId,
        {
          version: req.body?.version,
          strategy: req.body?.strategy,
          percentage: req.body?.percentage,
        },
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public rollbackProduction = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.rollbackProduction(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public promoteCanary = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.promoteCanary(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public abortCanary = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.abortCanary(
        workspaceId,
        userId,
        promptId,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };

  public bindFeature = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = this.getUserId(req);
      const workspaceId = this.getParam(req, "workspaceId");
      const promptId = this.getParam(req, "promptId");

      const deployment = await promptLibraryService.bindFeature(
        workspaceId,
        userId,
        promptId,
        req.body?.featureKey ?? null,
      );
      res.status(200).json({ status: "success", data: deployment });
    } catch (err) {
      next(err);
    }
  };
}

export default new PromptLibraryController();
