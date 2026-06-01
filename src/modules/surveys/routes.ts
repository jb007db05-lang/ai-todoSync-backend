import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import surveyController from "./controller.js";
import { requireSurveyAdmin } from "./permissions.js";

class SurveyRoutes implements Routes {
  public path = "/api/surveys";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(requireSurveyAdmin);
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
