import { Router } from "express";
import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import {
  listWorkspacePlans,
  generateProjectPlan,
  modifyProjectPlan,
  confirmProjectPlan,
  decomposeTask,
  planDailyWork,
  generateDocument,
  generateNotes,
  chatWithProjectAssistant,
} from "../../../modules/ai/controllers/ai.controller.js";

import aiPlanningController from "../../../modules/ai-planner/controllers/ai-planning.controller.js";

import {
  getProviders,
  getModels,
  getModelDetails,
} from "../../../modules/ai/controllers/ai-catalog.controller.js";

class CentralizedAiRoutes implements Routes {
  public path = "/api/ai";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.use(authMiddleware);

    this.router.get("/providers", getProviders);
    this.router.get("/models", getModels);
    this.router.get("/models/:modelId", getModelDetails);

    this.router.get(
      "/workspace-sessions",
      aiPlanningController.listWorkspaceSessions,
    );
    this.router.post(
      "/workspace-sessions",
      aiPlanningController.createWorkspaceSession,
    );
    this.router.get(
      "/workspace-sessions/:sessionId",
      aiPlanningController.getWorkspaceSession,
    );
    this.router.delete(
      "/workspace-sessions/:sessionId",
      aiPlanningController.deleteWorkspaceSession,
    );
    this.router.get("/workspace-plans", listWorkspacePlans);
    this.router.post("/project-plan", generateProjectPlan);
    this.router.post("/modify-project-plan", modifyProjectPlan);
    this.router.post("/confirm-project-plan", confirmProjectPlan);
    this.router.post("/task-breakdown", decomposeTask);
    this.router.post("/daily-plan", planDailyWork);
    this.router.post("/document-generation", generateDocument);
    this.router.post("/notes-generation", generateNotes);
    this.router.post("/chat", chatWithProjectAssistant);
  }
}

export default CentralizedAiRoutes;
