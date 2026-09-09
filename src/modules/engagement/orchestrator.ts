import { GuideExposureModel } from "./model.js";
import type { RuntimeGuideDto } from "./dtos.js";
import targetingService from "../targeting/service.js";
import logger from "../../lib/logger.js";

const INTRUSIVE_TYPES = ["MODAL", "SURVEY", "TOUR"];

export class ExperienceOrchestrator {
  private activeLockTimeoutMs = 15 * 60 * 1000; // 15 minutes
  private globalCooldownMs = 5 * 60 * 1000; // 5 minutes

  public async orchestrate(input: {
    tenantId: string;
    userId?: string;
    sessionId?: string;
    experiences: RuntimeGuideDto[];
    forceShowCompleted?: boolean;
  }): Promise<RuntimeGuideDto[]> {
    const startTime = Date.now();
    const { tenantId, userId, sessionId, experiences, forceShowCompleted } =
      input;

    if (experiences.length === 0) {
      if (process.env.DEBUG_ORCHESTRATION === "true") {
        logger.info(`[Orchestration Debug] Runtime Evaluation`);
        logger.info(`- Eligible Experiences: []`);
        logger.info(`- Active Lock: false`);
        logger.info(`- Cooldown: false`);
        logger.info(`- Critical Bypass: []`);
        logger.info(`- Selected Intrusive: none`);
        logger.info(`- Suppressed Experiences: []`);
        logger.info(`- Returned Experiences: []`);
        logger.info(`- Evaluation Time: ${Date.now() - startTime}ms`);
      }
      return [];
    }

    // Identify user/session filter for database lookups
    const userFilter: any = { tenantId };
    const orConditions: any[] = [];
    if (userId) {
      orConditions.push({ userId });
    }
    if (sessionId) {
      orConditions.push({ sessionId });
    }

    let hasActiveLock = false;
    let hasCooldown = false;

    if (orConditions.length > 0 && !forceShowCompleted) {
      userFilter.$or = orConditions;

      // 1. Check for Active Lock (status: started, updated within 15 mins)
      const activeLockExposure = await GuideExposureModel.findOne({
        ...userFilter,
        status: "started",
        updatedAt: { $gte: new Date(Date.now() - this.activeLockTimeoutMs) },
      })
        .lean()
        .exec();

      hasActiveLock = !!activeLockExposure;

      // 2. Check for Global Cooldown (any shown experience in last 5 mins)
      const recentExposure = await GuideExposureModel.findOne({
        ...userFilter,
        lastShownAt: { $gte: new Date(Date.now() - this.globalCooldownMs) },
      })
        .lean()
        .exec();

      hasCooldown = !!recentExposure;
    }

    const { result, suppressed, criticalBypass, selectedIntrusive } =
      this.selectExperiences(experiences, hasActiveLock, hasCooldown);

    if (process.env.DEBUG_ORCHESTRATION === "true") {
      logger.info(`[Orchestration Debug] Runtime Evaluation`);
      logger.info(
        `- Eligible Experiences: [${experiences.map((e) => `${e.type}:${e.priority}:${e.id}`).join(", ")}]`,
      );
      logger.info(`- Active Lock: ${hasActiveLock}`);
      logger.info(`- Cooldown: ${hasCooldown}`);
      logger.info(`- Critical Bypass: [${criticalBypass.join(", ")}]`);
      logger.info(
        `- Selected Intrusive: ${selectedIntrusive ? `${selectedIntrusive.type}:${selectedIntrusive.priority}:${selectedIntrusive.id}` : "none"}`,
      );
      logger.info(`- Suppressed Experiences: [${suppressed.join(", ")}]`);
      logger.info(
        `- Returned Experiences: [${result.map((e) => `${e.type}:${e.priority}:${e.id}`).join(", ")}]`,
      );
      logger.info(`- Evaluation Time: ${Date.now() - startTime}ms`);
    }

    return result;
  }

  private selectExperiences(
    experiences: RuntimeGuideDto[],
    hasActiveLock: boolean,
    hasCooldown: boolean,
  ): {
    result: RuntimeGuideDto[];
    suppressed: string[];
    criticalBypass: string[];
    selectedIntrusive?: RuntimeGuideDto;
  } {
    const intrusive: RuntimeGuideDto[] = [];
    const nonIntrusive: RuntimeGuideDto[] = [];
    const suppressed: string[] = [];
    const criticalBypass: string[] = [];

    for (const exp of experiences) {
      const isIntrusive = INTRUSIVE_TYPES.includes(exp.type.toUpperCase());
      if (isIntrusive) {
        if (hasActiveLock) {
          suppressed.push(
            `${exp.type}:${exp.priority}:${exp.id} (Blocked by active lock)`,
          );
          continue;
        }
        if (hasCooldown) {
          if (exp.priority.toUpperCase() === "CRITICAL") {
            criticalBypass.push(`${exp.type}:${exp.priority}:${exp.id}`);
          } else {
            suppressed.push(
              `${exp.type}:${exp.priority}:${exp.id} (Blocked by cooldown)`,
            );
            continue;
          }
        }
        intrusive.push(exp);
      } else {
        nonIntrusive.push(exp);
      }
    }

    if (intrusive.length > 1) {
      intrusive.sort((left, right) =>
        targetingService.comparePriority(left.priority, right.priority),
      );
      for (let i = 1; i < intrusive.length; i++) {
        suppressed.push(
          `${intrusive[i].type}:${intrusive[i].priority}:${intrusive[i].id} (Suppressed by higher priority ${intrusive[0].priority})`,
        );
      }
    }

    const result: RuntimeGuideDto[] = [];
    let selectedIntrusive: RuntimeGuideDto | undefined;
    if (intrusive.length > 0) {
      selectedIntrusive = intrusive[0];
      result.push(selectedIntrusive);
    }
    result.push(...nonIntrusive);

    return { result, suppressed, criticalBypass, selectedIntrusive };
  }
}

export default new ExperienceOrchestrator();
