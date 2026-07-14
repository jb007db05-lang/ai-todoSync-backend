import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import { getTenantIdFromRequest } from "./permissions.js";
import surveyService from "./service.js";
import {
  validateCreateSurveyDto,
  validateSubmitSurveyResponseDto,
  validateSurveyQueryDto,
  validateUpdateSurveyDto,
} from "./validators.js";

const getParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

const getSdkIntegrationId = (req: Request): string => {
  const raw = req.sdkIntegration?._id?.toString() ?? req.params["sdkIntegrationId"];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) throw new Error("sdkIntegrationId missing from request context");
  return id;
};

class SurveyController {
  public listSurveys = async (req: Request, res: Response): Promise<void> => {
    try {
      const surveys = await surveyService.listSurveys(
        getTenantIdFromRequest(req),
        getSdkIntegrationId(req),
        validateSurveyQueryDto(req.query),
      );
      res.status(200).json({ data: { surveys } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public getSurvey = async (req: Request, res: Response): Promise<void> => {
    try {
      const survey = await surveyService.getSurvey(
        getTenantIdFromRequest(req),
        getSdkIntegrationId(req),
        getParam(req.params.surveyId),
      );
      res.status(200).json({ data: { survey } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public createSurvey = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const sdkIntegrationId = getSdkIntegrationId(req);
      const survey = await surveyService.createSurvey(
        tenantId,
        sdkIntegrationId,
        tenantId,
        validateCreateSurveyDto(req.body),
      );
      res.status(201).json({ data: { survey } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public updateSurvey = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const survey = await surveyService.updateSurvey(
        tenantId,
        getSdkIntegrationId(req),
        getParam(req.params.surveyId),
        tenantId,
        validateUpdateSurveyDto(req.body),
      );
      res.status(200).json({ data: { survey } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public deleteSurvey = async (req: Request, res: Response): Promise<void> => {
    try {
      await surveyService.deleteSurvey(
        getTenantIdFromRequest(req),
        getSdkIntegrationId(req),
        getParam(req.params.surveyId),
      );
      res.status(200).json({ data: { deleted: true } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public submitResponse = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const response = await surveyService.submitResponse(
        getTenantIdFromRequest(req),
        getSdkIntegrationId(req),
        getParam(req.params.surveyId),
        validateSubmitSurveyResponseDto(req.body),
      );
      res.status(201).json({ data: { response } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public analytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const analytics = await surveyService.getSurveyAnalytics(
        getTenantIdFromRequest(req),
        getSdkIntegrationId(req),
        getParam(req.params.surveyId),
      );
      res.status(200).json({ data: analytics });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  private respondError(res: Response, error: unknown): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: "Survey request failed" });
  }
}

export default new SurveyController();
