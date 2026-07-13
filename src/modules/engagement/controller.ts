import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import checklistService from "../checklists/service.js";
import guideService from "../guides/service.js";
import surveyService from "../surveys/service.js";
import targetingService from "../targeting/service.js";
import { getTenantIdFromRequest } from "./permissions.js";
import engagementService from "./service.js";
import experienceOrchestrator from "./orchestrator.js";
import {
  validateEngagementTrackDto,
  validateRuntimeEvaluationDto,
} from "./validators.js";

class EngagementController {
  public runtime = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const dto = validateRuntimeEvaluationDto(req.body);
      const context = {
        userId: dto.userId ?? req.user?._id?.toString(),
        sessionId: dto.sessionId ?? req.auth?.sessionId ?? undefined,
        url: dto.url,
        referrer: dto.referrer,
        role: dto.role,
        plan: dto.plan,
        accountCreatedAt: dto.accountCreatedAt ?? req.user?.createdAt,
        userProperties: dto.userProperties,
        session: dto.session,
        workflow: dto.workflow,
        now: dto.now,
        eventName: dto.eventName,
        eventProperties: dto.eventProperties,
      };

      if (dto.eventName) {
        await checklistService.applyEvent(tenantId, {
          eventName: dto.eventName,
          userId: context.userId,
          sessionId: context.sessionId,
          properties: dto.eventProperties,
        });
      }

      const [guides, surveys, checklists] = await Promise.all([
        guideService.getEligibleGuides(tenantId, context),
        surveyService.getEligibleSurveys(tenantId, context),
        checklistService.getEligibleChecklists(tenantId, context),
      ]);
      const rawExperiences = [...guides, ...surveys, ...checklists];
      const experiences = await experienceOrchestrator.orchestrate({
        tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        experiences: rawExperiences,
      });

      await engagementService.recordRuntimeDelivery({
        tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        guides: experiences,
      });

      res.status(200).json({ data: { experiences } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public track = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const result = await engagementService.recordInteraction({
        tenantId,
        actorUserId: req.user?._id?.toString(),
        dto: validateEngagementTrackDto(req.body),
      });
      res.status(200).json({ data: result });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public mtu = async (req: Request, res: Response): Promise<void> => {
    try {
      const now = new Date();
      const month =
        typeof req.query.month === "string"
          ? req.query.month
          : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const count = await engagementService.countMtu(
        getTenantIdFromRequest(req),
        month,
      );
      res.status(200).json({ data: { month, mtu: count } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  private respondError(res: Response, error: unknown): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: "Engagement request failed" });
  }
}

export default new EngagementController();
