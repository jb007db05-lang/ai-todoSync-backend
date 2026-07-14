import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSdkIntegrationAccess } from "../../middleware/sdkIntegrationAuth.middleware.js";
import surveyController from "./controller.js";

class SurveyRoutes implements Routes {
  public path = "/api/sdk-integrations/:sdkIntegrationId/surveys";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware, requireSdkIntegrationAccess);
    this.router.get("/", surveyController.listSurveys);
    this.router.post("/", surveyController.createSurvey);
    this.router.get("/:surveyId", surveyController.getSurvey);
    this.router.patch("/:surveyId", surveyController.updateSurvey);
    this.router.delete("/:surveyId", surveyController.deleteSurvey);
    this.router.post("/:surveyId/responses", surveyController.submitResponse);
    this.router.get("/:surveyId/analytics", surveyController.analytics);
  }
}

export default SurveyRoutes;
