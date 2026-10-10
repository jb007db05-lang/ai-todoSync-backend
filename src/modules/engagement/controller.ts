import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import checklistService from "../checklists/service.js";
import guideService from "../guides/service.js";
import surveyService from "../surveys/service.js";
import { getTenantIdFromRequest } from "./permissions.js";
import engagementService from "./service.js";
import experienceOrchestrator from "./orchestrator.js";
import sdkIntegrationService from "../sdk-integrations/service.js";
import {
  validateEngagementTrackDto,
  validateRuntimeEvaluationDto,
} from "./validators.js";
import logger from "../../lib/logger.js";
import { isObjectId } from "./lifecycle.js";
import {
  parseEnvironment,
  type DataEnvironment,
} from "../../shared/environment.js";

/**
 * The integration a request acts on. SDK keys carry their integration. Portal
 * (JWT) users may name one of their own integrations; anything else falls
 * back to their first integration, so a foreign or stale id can never be used
 * to read or write another tenant's engagement data.
 */
const resolveIntegrationId = async (
  req: Request,
  tenantId: string,
  requested: unknown,
): Promise<string> => {
  const fromKey = req.sdkIntegration?._id?.toString();
  if (fromKey) return fromKey;
  // Legacy analytics keys have no integration; their events go through the key.
  if (req.apiKeyId) return "";

  try {
    if (isObjectId(requested)) {
      const owned = await sdkIntegrationService.getOne(tenantId, requested);
      if (owned) return owned._id.toString();
    }
    const integrations = await sdkIntegrationService.listByTenant(tenantId);
    return integrations[0]?._id?.toString() ?? "";
  } catch (err) {
    logger.warn("Engagement: failed to resolve sdkIntegrationId", {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
};

class EngagementController {
  public runtime = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const dto = validateRuntimeEvaluationDto(req.body);
      const sdkIntegrationId = await resolveIntegrationId(
        req,
        tenantId,
        dto.sdkIntegrationId,
      );

      // The key decides the environment for SDK traffic; portal (JWT) users
      // may ask for sandbox to preview drafts.
      const environment: DataEnvironment = req.sdkIntegration
        ? (req.sdkEnvironment ?? "live")
        : parseEnvironment(dto.environment);
      // End users must not bypass frequency caps on live traffic.
      const forceShowCompleted =
        environment === "sandbox" || !req.sdkIntegration
          ? dto.forceShowCompleted
          : undefined;

      const context = {
        environment,
        userId: dto.userId ?? req.user?._id?.toString(),
        sessionId: dto.sessionId ?? req.auth?.sessionId ?? undefined,
        sdkIntegrationId,
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
        forceShowCompleted,
      };

      // Checklist progress is live-only data.
      if (dto.eventName && sdkIntegrationId && environment === "live") {
        await checklistService.applyEvent(tenantId, sdkIntegrationId, {
          eventName: dto.eventName,
          userId: context.userId,
          sessionId: context.sessionId,
          properties: dto.eventProperties,
        });
      }

      const [guides, surveys, checklists] = await Promise.all([
        guideService.getEligibleGuides(tenantId, sdkIntegrationId, context),
        surveyService.getEligibleSurveys(tenantId, sdkIntegrationId, context),
        checklistService.getEligibleChecklists(tenantId, context),
      ]);
      let rawExperiences = [...guides, ...surveys, ...checklists];
      // A manual trigger asks for one specific experience: when it is
      // servable, show only it, so other eligible items cannot outrank it.
      const manualTourId = dto.eventProperties?.tourId;
      if (dto.eventName === "manual_tour" && typeof manualTourId === "string") {
        const requested = rawExperiences.filter((e) => e.id === manualTourId);
        if (requested.length > 0) rawExperiences = requested;
      }
      const experiences = await experienceOrchestrator.orchestrate({
        tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        experiences: rawExperiences,
        forceShowCompleted: context.forceShowCompleted,
        environment,
      });

      await engagementService.recordRuntimeDelivery({
        tenantId,
        sdkIntegrationId,
        environment,
        userId: context.userId,
        sessionId: context.sessionId,
        guides: experiences,
      });

      res.status(200).json({ data: { experiences, environment } });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public track = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const body = req.body as Record<string, unknown> | undefined;
      const dto = validateEngagementTrackDto(req.body);
      // Exposures must be recorded under the same integration the runtime
      // evaluated, or frequency caps never see dismissals and completions.
      const sdkIntegrationId = await resolveIntegrationId(
        req,
        tenantId,
        body?.sdkIntegrationId,
      );
      const environment: DataEnvironment = req.sdkIntegration
        ? (req.sdkEnvironment ?? "live")
        : parseEnvironment(body?.environment);
      const result = await engagementService.recordInteraction({
        tenantId,
        sdkIntegrationId,
        environment,
        actorUserId: req.user?._id?.toString(),
        dto,
      });
      res.status(200).json({ data: result });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  public mtu = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const sdkIntegrationId = await resolveIntegrationId(
        req,
        tenantId,
        req.query.sdkIntegrationId,
      );
      const now = new Date();
      const month =
        typeof req.query.month === "string"
          ? req.query.month
          : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        res
          .status(400)
          .json({ error: "month must be YYYY-MM", code: "INVALID_MONTH" });
        return;
      }
      const count = await engagementService.countMtu(sdkIntegrationId, month);
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
