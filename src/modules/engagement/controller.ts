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
import {
  parseEnvironment,
  type DataEnvironment,
} from "../../shared/environment.js";

class EngagementController {
  public runtime = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = getTenantIdFromRequest(req);
      const dto = validateRuntimeEvaluationDto(req.body);

      // Resolve sdkIntegrationId: SDK key sets req.sdkIntegration directly.
      // For JWT portal users, prefer body-supplied id then fall back to the
      // tenant's first active integration so guides/surveys are always found.
      let sdkIntegrationId =
        req.sdkIntegration?._id?.toString() ??
        (typeof dto.sdkIntegrationId === "string" ? dto.sdkIntegrationId : "");

      if (!sdkIntegrationId) {
        try {
          const integrations =
            await sdkIntegrationService.listByTenant(tenantId);
          sdkIntegrationId = integrations[0]?._id?.toString() ?? "";
          if (sdkIntegrationId) {
            logger.info("Runtime: resolved sdkIntegrationId from tenant", {
              tenantId,
              sdkIntegrationId,
            });
          }
        } catch (err) {
          logger.warn(
            "Runtime: failed to resolve sdkIntegrationId from tenant",
            {
              tenantId,
              err: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }

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
      const sdkIntegrationId = req.sdkIntegration?._id?.toString() ?? "";
      const environment: DataEnvironment = req.sdkIntegration
        ? (req.sdkEnvironment ?? "live")
        : parseEnvironment(
            (req.body as Record<string, unknown> | undefined)?.environment,
          );
      const result = await engagementService.recordInteraction({
        tenantId,
        sdkIntegrationId,
        environment,
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
      const tenantId = getTenantIdFromRequest(req);
      const integrations = await sdkIntegrationService.listByTenant(tenantId);
      const sdkIntegrationId =
        req.sdkIntegration?._id?.toString() ??
        integrations[0]?._id?.toString() ??
        "";
      const now = new Date();
      const month =
        typeof req.query.month === "string"
          ? req.query.month
          : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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
