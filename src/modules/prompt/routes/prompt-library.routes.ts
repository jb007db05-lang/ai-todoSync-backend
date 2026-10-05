import { Router } from "express";
import type { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import promptLibraryController from "../../../modules/prompt/controllers/prompt-library.controller.js";

class PromptLibraryRoutes implements Routes {
  public path = "/api/workspaces/:workspaceId/prompts";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);

    // Folders
    this.router.post("/folders", promptLibraryController.createFolder);
    this.router.get("/folders", promptLibraryController.listFolders);
    this.router.patch(
      "/folders/:folderId",
      promptLibraryController.updateFolder,
    );
    this.router.delete(
      "/folders/:folderId",
      promptLibraryController.deleteFolder,
    );

    // AI feature registry & bindings (before "/:promptId")
    this.router.get("/features", promptLibraryController.listFeatures);

    // Prompts CRUD
    this.router.get("/", promptLibraryController.listPrompts);
    this.router.post("/", promptLibraryController.createPrompt);
    this.router.get("/:promptId", promptLibraryController.getPromptDetails);
    this.router.patch("/:promptId", promptLibraryController.updatePrompt);
    this.router.delete("/:promptId", promptLibraryController.deletePrompt);

    // Versioning & Comparisons
    this.router.get(
      "/:promptId/versions",
      promptLibraryController.getPromptVersions,
    );
    this.router.get(
      "/:promptId/compare",
      promptLibraryController.comparePromptVersions,
    );

    // Deployments: production version, canary rollout, feature binding
    this.router.get(
      "/:promptId/deployment",
      promptLibraryController.getDeployment,
    );
    this.router.post(
      "/:promptId/deployment/deploy",
      promptLibraryController.deployVersion,
    );
    this.router.post(
      "/:promptId/deployment/rollback",
      promptLibraryController.rollbackProduction,
    );
    this.router.put(
      "/:promptId/deployment/production",
      promptLibraryController.setProductionVersion,
    );
    this.router.put(
      "/:promptId/deployment/canary",
      promptLibraryController.startCanary,
    );
    this.router.post(
      "/:promptId/deployment/canary/promote",
      promptLibraryController.promoteCanary,
    );
    this.router.delete(
      "/:promptId/deployment/canary",
      promptLibraryController.abortCanary,
    );
    this.router.put(
      "/:promptId/deployment/feature",
      promptLibraryController.bindFeature,
    );

    // Validation & Rendering Execution Engine
    this.router.post(
      "/:promptId/validate",
      promptLibraryController.validatePromptVariables,
    );
    this.router.post("/:promptId/render", promptLibraryController.renderPrompt);

    // Playground Execution Engine
    this.router.post("/playground/run", promptLibraryController.runPlayground);
    this.router.post(
      "/:promptId/playground/run",
      promptLibraryController.runPlayground,
    );

    // Favorites
    this.router.post(
      "/:promptId/favorite",
      promptLibraryController.toggleFavorite,
    );
  }
}

export default PromptLibraryRoutes;
