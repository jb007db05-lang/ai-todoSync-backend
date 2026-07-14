import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import { getTenantIdFromRequest } from "./permissions.js";
import checklistService from "./service.js";
import {
  validateChecklistEventDto,
  validateChecklistQueryDto,
  validateCreateChecklistDto,
  validateUpdateChecklistDto,
} from "./validators.js";

const getParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

class ChecklistController {
  public listChecklists = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const checklists = await checklistService.listChecklists(
        getTenantIdFromRequest(req),
        validateChecklistQueryDto(req.query),
      );
      res.status(200).json({ data: { checklists } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public getChecklist = async (req: Request, res: Response): Promise<void> => {
    try {
      const checklist = await checklistService.getChecklist(
        getTenantIdFromRequest(req),
        getParam(req.params.checklistId),
      );
      res.status(200).json({ data: { checklist } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public createChecklist = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const checklist = await checklistService.createChecklist(
        tenantId,
        tenantId,
        validateCreateChecklistDto(req.body),
      );
      res.status(201).json({ data: { checklist } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public updateChecklist = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const checklist = await checklistService.updateChecklist(
        tenantId,
        getParam(req.params.checklistId),
        tenantId,
        validateUpdateChecklistDto(req.body),
      );
      res.status(200).json({ data: { checklist } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public deleteChecklist = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      await checklistService.deleteChecklist(
        getTenantIdFromRequest(req),
        getParam(req.params.checklistId),
      );
      res.status(200).json({ data: { deleted: true } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public applyEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const sdkIntegrationId = req.sdkIntegration?._id?.toString() ?? "";
      const progress = await checklistService.applyEvent(
        tenantId,
        sdkIntegrationId,
        validateChecklistEventDto(req.body),
      );
      res.status(200).json({ data: { progress } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  private respondError(res: Response, error: unknown): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: "Checklist request failed" });
  }
}

export default new ChecklistController();
