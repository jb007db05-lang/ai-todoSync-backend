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

    // Validation & Rendering Execution Engine
    this.router.post(
      "/:promptId/validate",
      promptLibraryController.validatePromptVariables,
    );
    this.router.post("/:promptId/render", promptLibraryController.renderPrompt);

    // Favorites
    this.router.post(
      "/:promptId/favorite",
      promptLibraryController.toggleFavorite,
    );
  }
}

export default PromptLibraryRoutes;
