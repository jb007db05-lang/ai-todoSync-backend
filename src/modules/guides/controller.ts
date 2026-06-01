import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import { getTenantIdFromRequest } from "./permissions.js";
import guideService from "./service.js";
import {
  validateCreateGuideDto,
  validateGuideQueryDto,
  validateUpdateGuideDto,
} from "./validators.js";

const getParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

class GuideController {
  public listGuides = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const guides = await guideService.listGuides(
        tenantId,
        validateGuideQueryDto(req.query),
      );
      res.status(200).json({ data: { guides } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public getGuide = async (req: Request, res: Response): Promise<void> => {
    try {
      const guide = await guideService.getGuide(
        getTenantIdFromRequest(req),
        getParam(req.params.guideId),
      );
      res.status(200).json({ data: { guide } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public createGuide = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const guide = await guideService.createGuide(
        tenantId,
        tenantId,
        validateCreateGuideDto(req.body),
      );
      res.status(201).json({ data: { guide } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public updateGuide = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const guide = await guideService.updateGuide(
        tenantId,
        getParam(req.params.guideId),
        tenantId,
        validateUpdateGuideDto(req.body),
      );
      res.status(200).json({ data: { guide } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = getParam(req.params.status).toUpperCase();
      if (
        status !== "DRAFT" &&
        status !== "LIVE" &&
        status !== "PAUSED" &&
        status !== "ARCHIVED"
      ) {
        res.status(400).json({ error: "Invalid guide status" });
        return;
      }

      const tenantId = getTenantIdFromRequest(req);
      const guide = await guideService.updateStatus(
        tenantId,
        getParam(req.params.guideId),
        tenantId,
        status,
      );
      res.status(200).json({ data: { guide } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public deleteGuide = async (req: Request, res: Response): Promise<void> => {
    try {
      await guideService.deleteGuide(
        getTenantIdFromRequest(req),
        getParam(req.params.guideId),
      );
      res.status(200).json({ data: { deleted: true } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public analytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = await guideService.getGuideExposureSummary(
        getTenantIdFromRequest(req),
        getParam(req.params.guideId),
      );
      res.status(200).json({ data: summary });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  private respondError(res: Response, error: unknown): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: "Guide request failed" });
  }
}

export default new GuideController();
