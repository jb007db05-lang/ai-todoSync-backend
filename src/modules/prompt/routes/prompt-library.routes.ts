import { Router } from "express";
import type { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import promptLibraryController from "../../../modules/prompt/controllers/prompt-library.controller.js";
import {
  requirePermission,
  workspaceContext,
} from "../../access/access.middleware.js";

// Permission per route group. Visibility of individual prompts (own, shared,
// project, workspace-wide) is checked in the services.
const library = requirePermission("library.access");
const view = requirePermission("prompt.access");
const create = requirePermission("prompt.create");
const share = requirePermission("prompt.share_individual");

class PromptLibraryRoutes implements Routes {
  public path = "/api/workspaces/:workspaceId/prompts";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware, workspaceContext());

    // Folders
    this.router.post("/folders", library, promptLibraryController.createFolder);
    this.router.get("/folders", library, promptLibraryController.listFolders);
    this.router.patch(
      "/folders/:folderId",
      library,
      promptLibraryController.updateFolder,
    );
    this.router.delete(
      "/folders/:folderId",
      library,
      promptLibraryController.deleteFolder,
    );

    // AI feature registry & bindings (before "/:promptId")
    this.router.get("/features", library, promptLibraryController.listFeatures);

    // Prompts CRUD
    this.router.get("/", view, promptLibraryController.listPrompts);
    this.router.post("/", create, promptLibraryController.createPrompt);
    this.router.get(
      "/:promptId",
      view,
      promptLibraryController.getPromptDetails,
    );
    this.router.patch(
      "/:promptId",
      create,
      promptLibraryController.updatePrompt,
    );
    this.router.delete(
      "/:promptId",
      create,
      promptLibraryController.deletePrompt,
    );

    // Versioning & Comparisons
    this.router.get(
      "/:promptId/versions",
      view,
      promptLibraryController.getPromptVersions,
    );
    this.router.get(
      "/:promptId/compare",
      view,
      promptLibraryController.comparePromptVersions,
    );

    // Deployments: production version, canary rollout, feature binding
    this.router.get(
      "/:promptId/deployment",
      view,
      promptLibraryController.getDeployment,
    );
    this.router.post(
      "/:promptId/deployment/deploy",
      view,
      promptLibraryController.deployVersion,
    );
    this.router.post(
      "/:promptId/deployment/rollback",
      view,
      promptLibraryController.rollbackProduction,
    );
    this.router.put(
      "/:promptId/deployment/production",
      view,
      promptLibraryController.setProductionVersion,
    );
    this.router.put(
      "/:promptId/deployment/canary",
      view,
      promptLibraryController.startCanary,
    );
    this.router.post(
      "/:promptId/deployment/canary/promote",
      view,
      promptLibraryController.promoteCanary,
    );
    this.router.delete(
      "/:promptId/deployment/canary",
      view,
      promptLibraryController.abortCanary,
    );
    this.router.put(
      "/:promptId/deployment/feature",
      view,
      promptLibraryController.bindFeature,
    );

    // Validation & Rendering Execution Engine
    this.router.post(
      "/:promptId/validate",
      view,
      promptLibraryController.validatePromptVariables,
    );
    this.router.post(
      "/:promptId/render",
      view,
      promptLibraryController.renderPrompt,
    );

    // Playground Execution Engine
    this.router.post(
      "/playground/run",
      library,
      promptLibraryController.runPlayground,
    );
    this.router.post(
      "/:promptId/playground/run",
      library,
      promptLibraryController.runPlayground,
    );

    // Individual sharing
    this.router.get(
      "/:promptId/access",
      share,
      promptLibraryController.listPromptAccess,
    );
    this.router.post(
      "/:promptId/access",
      share,
      promptLibraryController.grantPromptAccess,
    );
    this.router.delete(
      "/:promptId/access/:userId",
      share,
      promptLibraryController.revokePromptAccess,
    );

    // Favorites
    this.router.post(
      "/:promptId/favorite",
      view,
      promptLibraryController.toggleFavorite,
    );
  }
}

export default PromptLibraryRoutes;
