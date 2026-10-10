import AnalyticsEventRegistryModel from "../analytics/models/analytics-event-registry.model.js";
import AnalyticsKeyModel from "../analytics/models/analytics-key.model.js";
import AnalyticsLogModel from "../analytics/models/analytics-log.model.js";
import { AppError } from "../../utils/app-error.js";
import { GuideExposureModel } from "../engagement/model.js";
import type {
  FrequencyRules,
  GuideEligibilityResult,
  ScheduleRules,
  TargetingCondition,
  TargetingRuleGroup,
  TargetingRuntimeContext,
} from "../engagement/types.js";
import type {
  CreateTargetingSegmentDto,
  UpdateTargetingSegmentDto,
} from "./dtos.js";
import targetingRepository from "./repository.js";
import { isValidTimeZone } from "./validators.js";
import {
  environmentFilter,
  type DataEnvironment,
} from "../../shared/environment.js";

interface EvaluationInput {
  rules?: TargetingRuleGroup | null;
  context: TargetingRuntimeContext;
  guideId?: string;
  frequencyRules?: FrequencyRules;
  scheduleRules?: ScheduleRules;
}

interface ConditionEvaluation {
  matched: boolean;
  reason: string;
}

const PRIORITY_INDEX: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

class TargetingService {
  public listSegments(tenantId: string) {
    return targetingRepository.listSegments(tenantId);
  }

  public getSegment(tenantId: string, segmentId: string) {
    return targetingRepository.getSegment(tenantId, segmentId);
  }

  public createSegment(
    tenantId: string,
    createdBy: string,
    dto: CreateTargetingSegmentDto,
  ) {
    return targetingRepository.createSegment(tenantId, createdBy, dto);
  }

  public async updateSegment(
    tenantId: string,
    segmentId: string,
    updatedBy: string,
    dto: UpdateTargetingSegmentDto,
  ) {
    const segment = await targetingRepository.updateSegment(
      tenantId,
      segmentId,
      updatedBy,
      dto,
    );

    if (!segment) {
      throw new AppError(404, "Targeting segment not found", "NOT_FOUND");
    }

    return segment;
  }

  public async deleteSegment(tenantId: string, segmentId: string) {
    const result = await targetingRepository.deleteSegment(tenantId, segmentId);

    if (result.deletedCount === 0) {
      throw new AppError(404, "Targeting segment not found", "NOT_FOUND");
    }
  }

  public async evaluate(
    input: EvaluationInput,
  ): Promise<GuideEligibilityResult> {
    const reasons: string[] = [];
    const matchedConditions: string[] = [];
    const failedConditions: string[] = [];
    const now = this.toDate(input.context.now) ?? new Date();

    const scheduleResult = this.evaluateSchedule(input.scheduleRules, now);
    if (!scheduleResult.matched) {
      return {
        eligible: false,
        reasons: [scheduleResult.reason],
        matchedConditions,
        failedConditions: ["schedule"],
      };
    }

    if (input.guideId && input.frequencyRules) {
      const frequencyResult = await this.evaluateFrequency({
        tenantId: input.context.tenantId,
        sdkIntegrationId: input.context.sdkIntegrationId,
        environment: input.context.environment,
        guideId: input.guideId,
        userId: input.context.userId,
        sessionId: input.context.sessionId,
        rules: input.frequencyRules,
        now,
        forceShowCompleted: input.context.forceShowCompleted,
      });

      if (!frequencyResult.matched) {
        return {
          eligible: false,
          reasons: [frequencyResult.reason],
          matchedConditions,
          failedConditions: ["frequency"],
        };
      }
    }

    if (!input.rules) {
      return {
        eligible: true,
        reasons: ["No targeting rules"],
        matchedConditions,
        failedConditions,
      };
    }

    const result = await this.evaluateGroup(input.rules, input.context);
    result.matchedConditions.forEach((condition) =>
      matchedConditions.push(condition),
    );
    result.failedConditions.forEach((condition) =>
      failedConditions.push(condition),
    );
    reasons.push(...result.reasons);

    return {
      eligible: result.eligible,
      reasons,
      matchedConditions,
      failedConditions,
    };
  }

  public comparePriority(left: string, right: string): number {
    return (PRIORITY_INDEX[right] ?? 0) - (PRIORITY_INDEX[left] ?? 0);
  }

  private async evaluateGroup(
    group: TargetingRuleGroup,
    context: TargetingRuntimeContext,
  ): Promise<GuideEligibilityResult> {
    const conditionResults = await Promise.all(
      (group.conditions ?? []).map(async (condition) => ({
        id: condition.id,
        ...(await this.evaluateCondition(condition, context)),
      })),
    );
    const groupResults = await Promise.all(
      (group.groups ?? []).map((nested) => this.evaluateGroup(nested, context)),
    );

    const allResults = [
      ...conditionResults.map((result) => result.matched),
      ...groupResults.map((result) => result.eligible),
    ];

    const eligible =
      allResults.length === 0
        ? true
        : group.operator === "AND"
          ? allResults.every(Boolean)
          : allResults.some(Boolean);

    const matchedConditions = [
      ...conditionResults
        .filter((result) => result.matched)
        .map((result) => result.id),
      ...groupResults.flatMap((result) => result.matchedConditions),
    ];
    const failedConditions = [
      ...conditionResults
        .filter((result) => !result.matched)
        .map((result) => result.id),
      ...groupResults.flatMap((result) => result.failedConditions),
    ];
    const reasons = [
      ...conditionResults.map((result) => result.reason),
      ...groupResults.flatMap((result) => result.reasons),
    ];

    return { eligible, matchedConditions, failedConditions, reasons };
  }

  private async evaluateCondition(
    condition: TargetingCondition,
    context: TargetingRuntimeContext,
  ): Promise<ConditionEvaluation> {
    switch (condition.type) {
      case "URL_EQUALS":
        return this.stringCondition(condition, context.url, "URL equals");
      case "URL_CONTAINS":
        return this.containsCondition(condition, context.url, "URL contains");
      case "URL_REGEX":
        return this.regexCondition(condition, context.url, "URL regex");
      case "REFERRER_EQUALS":
        return this.stringCondition(
          condition,
          context.referrer,
          "Referrer equals",
        );
      case "REFERRER_CONTAINS":
        return this.containsCondition(
          condition,
          context.referrer,
          "Referrer contains",
        );
      case "ROLE_EQUALS":
        return this.stringCondition(condition, context.role, "Role equals");
      case "PLAN_EQUALS":
        return this.stringCondition(condition, context.plan, "Plan equals");
      case "ACCOUNT_AGE":
        return this.numberCondition(
          condition,
          this.accountAgeDays(context.accountCreatedAt),
          "Account age",
        );
      case "TENANT_EQUALS":
        return this.stringCondition(
          condition,
          context.tenantId,
          "Tenant equals",
        );
      case "SESSION_DURATION":
        return this.numberCondition(
          condition,
          context.session?.durationSeconds,
          "Session duration",
        );
      case "SESSION_COUNT":
        return this.numberCondition(
          condition,
          context.session?.count,
          "Session count",
        );
      case "ENGAGEMENT_SCORE":
        return this.numberCondition(
          condition,
          context.session?.engagementScore,
          "Engagement score",
        );
      case "COMPLETED_WORKFLOW":
        return this.arrayContainsCondition(
          condition,
          context.workflow?.completed,
          "Completed workflow",
        );
      case "EVENT_TRIGGERED":
      case "EVENT_NOT_TRIGGERED":
      case "RAGE_CLICK_COUNT":
      case "VISITED_PAGE":
      case "ABANDONED_FORM":
        return this.behaviorCondition(condition, context);
      case "TIME_WINDOW": {
        // { start: "09:00", end: "17:00", daysOfWeek?: [1..5], timezone? }
        const window = (
          typeof condition.value === "object" && condition.value !== null
            ? condition.value
            : condition.metadata
        ) as
          | {
              start?: unknown;
              end?: unknown;
              daysOfWeek?: unknown;
              timezone?: unknown;
            }
          | undefined;
        if (
          typeof window?.start !== "string" ||
          typeof window?.end !== "string"
        ) {
          return { matched: true, reason: "Time window: none configured" };
        }
        const matched = this.isWithinWindow(
          this.toDate(context.now) ?? new Date(),
          {
            start: window.start,
            end: window.end,
            daysOfWeek: Array.isArray(window.daysOfWeek)
              ? (window.daysOfWeek as number[])
              : undefined,
          },
          typeof window.timezone === "string" ? window.timezone : undefined,
        );
        return {
          matched,
          reason: `Time window: ${matched ? "matched" : "failed"}`,
        };
      }
      case "SHOW_ONCE":
      case "SHOW_EVERY_X_DAYS":
      case "COOLDOWN":
        return {
          matched: true,
          reason: `${condition.type} handled by frequency engine`,
        };
      case "EXIT_INTENT":
        return {
          matched: context.eventName === "exit_intent",
          reason: `Exit intent: ${context.eventName === "exit_intent" ? "matched" : "failed"}`,
        };
      case "IDLE_TIMEOUT":
        return {
          matched: context.eventName === "idle_timeout",
          reason: `Idle timeout: ${context.eventName === "idle_timeout" ? "matched" : "failed"}`,
        };
      default:
        return {
          matched: false,
          reason: `Unsupported condition ${condition.type}`,
        };
    }
  }

  private stringCondition(
    condition: TargetingCondition,
    actual: string | undefined,
    label: string,
  ): ConditionEvaluation {
    return this.textCondition(condition, actual, label, "EQUALS");
  }

  private containsCondition(
    condition: TargetingCondition,
    actual: string | undefined,
    label: string,
  ): ConditionEvaluation {
    return this.textCondition(condition, actual, label, "CONTAINS");
  }

  private regexCondition(
    condition: TargetingCondition,
    actual: string | undefined,
    label: string,
  ): ConditionEvaluation {
    return this.textCondition(condition, actual, label, "REGEX");
  }

  /**
   * Text comparison. Each condition type has a natural default (URL_EQUALS
   * compares exactly, URL_CONTAINS looks for a substring); an explicit
   * operator on the condition overrides it.
   */
  private textCondition(
    condition: TargetingCondition,
    actual: string | undefined,
    label: string,
    defaultOperator: "EQUALS" | "CONTAINS" | "REGEX",
  ): ConditionEvaluation {
    const operator = condition.operator ?? defaultOperator;
    const expected = String(condition.value ?? "");
    const list = (): string[] =>
      Array.isArray(condition.value)
        ? condition.value.map((v) => String(v))
        : expected.split(",").map((v) => v.trim());

    let matched: boolean;
    switch (operator) {
      case "NOT_EQUALS":
        matched = actual !== expected;
        break;
      case "CONTAINS":
        matched = Boolean(actual?.includes(expected));
        break;
      case "NOT_CONTAINS":
        matched = !actual?.includes(expected);
        break;
      case "IN":
        matched = actual !== undefined && list().includes(actual);
        break;
      case "NOT_IN":
        matched = actual === undefined || !list().includes(actual);
        break;
      case "REGEX":
        try {
          matched = new RegExp(expected).test(actual ?? "");
        } catch {
          return { matched: false, reason: `${label}: invalid regex` };
        }
        break;
      default:
        matched = actual === expected;
    }
    return { matched, reason: `${label}: ${matched ? "matched" : "failed"}` };
  }

  private arrayContainsCondition(
    condition: TargetingCondition,
    actual: string[] | undefined,
    label: string,
  ): ConditionEvaluation {
    const expected = String(condition.value ?? "");
    const matched = Boolean(actual?.includes(expected));
    return { matched, reason: `${label}: ${matched ? "matched" : "failed"}` };
  }

  private numberCondition(
    condition: TargetingCondition,
    actual: number | undefined,
    label: string,
  ): ConditionEvaluation {
    if (typeof actual !== "number") {
      return { matched: false, reason: `${label}: unavailable` };
    }

    const operator = condition.operator ?? "GREATER_THAN_OR_EQUAL";
    if (operator === "BETWEEN") {
      const bounds = (
        Array.isArray(condition.value)
          ? condition.value
          : String(condition.value ?? "").split(",")
      ).map((v) => Number(v));
      const [low, high] = bounds;
      const matched =
        bounds.length === 2 &&
        Number.isFinite(low) &&
        Number.isFinite(high) &&
        actual >= Math.min(low, high) &&
        actual <= Math.max(low, high);
      return { matched, reason: `${label}: ${matched ? "matched" : "failed"}` };
    }
    const expected = Number(condition.value ?? condition.count ?? 0);
    const matched =
      operator === "LESS_THAN"
        ? actual < expected
        : operator === "LESS_THAN_OR_EQUAL"
          ? actual <= expected
          : operator === "GREATER_THAN"
            ? actual > expected
            : operator === "EQUALS"
              ? actual === expected
              : operator === "NOT_EQUALS"
                ? actual !== expected
                : actual >= expected;

    return { matched, reason: `${label}: ${matched ? "matched" : "failed"}` };
  }

  private async behaviorCondition(
    condition: TargetingCondition,
    context: TargetingRuntimeContext,
  ): Promise<ConditionEvaluation> {
    const eventName =
      condition.eventName ??
      (condition.type === "VISITED_PAGE"
        ? "page"
        : condition.type === "RAGE_CLICK_COUNT"
          ? "rage_click"
          : condition.type === "ABANDONED_FORM"
            ? "form_abandoned"
            : String(condition.value ?? ""));
    const count = await this.countEvents({
      tenantId: context.tenantId,
      sdkIntegrationId: context.sdkIntegrationId,
      environment: context.environment,
      userId: context.userId,
      sessionId: context.sessionId,
      eventName,
      windowDays: condition.windowDays,
      property: condition.property,
      value: condition.type === "VISITED_PAGE" ? condition.value : undefined,
    });

    if (condition.type === "EVENT_NOT_TRIGGERED") {
      return {
        matched: count === 0,
        reason: `Event not triggered ${eventName}: ${count === 0 ? "matched" : "failed"}`,
      };
    }

    const threshold = condition.count ?? Number(condition.value ?? 1);
    const matched = count >= threshold;
    return {
      matched,
      reason: `Behavior ${eventName}: ${matched ? "matched" : "failed"}`,
    };
  }

  /**
   * Counts a user's past events. SDK traffic is counted within its own
   * integration and environment; legacy analytics-key traffic (no
   * integration) across the tenant's active keys.
   */
  private async countEvents(input: {
    tenantId: string;
    sdkIntegrationId?: string;
    environment?: DataEnvironment;
    userId?: string;
    sessionId?: string;
    eventName: string;
    windowDays?: number;
    property?: string;
    value?: unknown;
  }): Promise<number> {
    let registryScope: Record<string, unknown>;
    let logScope: Record<string, unknown>;

    if (input.sdkIntegrationId) {
      registryScope = { sdkIntegrationId: input.sdkIntegrationId };
      logScope = {
        sdkIntegrationId: input.sdkIntegrationId,
        ...environmentFilter(input.environment),
      };
    } else {
      const keys = await AnalyticsKeyModel.find({
        userId: input.tenantId,
        status: "active",
      })
        .select("_id")
        .lean()
        .exec();
      const apiKeyIds = keys.map((key) => key._id.toString());

      if (apiKeyIds.length === 0) {
        return 0;
      }
      registryScope = { apiKeyId: { $in: apiKeyIds } };
      logScope = { apiKeyId: { $in: apiKeyIds } };
    }

    const events = await AnalyticsEventRegistryModel.find({
      ...registryScope,
      eventName: input.eventName,
    })
      .select("_id")
      .lean()
      .exec();
    const eventRefs = events.map((event) => event._id.toString());

    if (eventRefs.length === 0) {
      return 0;
    }

    const createdAt =
      typeof input.windowDays === "number" && input.windowDays > 0
        ? { $gte: new Date(Date.now() - input.windowDays * 86400000) }
        : undefined;
    const filter: Record<string, unknown> = {
      ...logScope,
      eventRef: { $in: eventRefs },
      ...(input.userId ? { userIdentifier: input.userId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    if (input.property && input.value !== undefined) {
      filter[`payload.${input.property}`] = input.value;
    }

    if (!input.property && input.value !== undefined) {
      filter.$or = [
        { "payload.url": input.value },
        { "payload.properties.url": input.value },
      ];
    }

    return AnalyticsLogModel.countDocuments(filter).exec();
  }

  private evaluateSchedule(
    rules: ScheduleRules | undefined,
    now: Date,
  ): ConditionEvaluation {
    if (!rules) {
      return { matched: true, reason: "No schedule rules" };
    }

    const startsAt = this.toDate(rules.startsAt);
    const endsAt = this.toDate(rules.endsAt);

    if (startsAt && now < startsAt) {
      return { matched: false, reason: "Guide schedule has not started" };
    }

    if (endsAt && now > endsAt) {
      return { matched: false, reason: "Guide schedule has ended" };
    }

    if (rules.windows && rules.windows.length > 0) {
      const inWindow = rules.windows.some((window) =>
        this.isWithinWindow(now, window, rules.timezone),
      );
      if (!inWindow) {
        return {
          matched: false,
          reason: "Outside the scheduled time windows",
        };
      }
    }

    return { matched: true, reason: "Schedule matched" };
  }

  /**
   * Whether `now` falls in a daily window ("09:00"–"17:30") in the given time
   * zone (UTC by default). A window whose end is before its start runs past
   * midnight; its days refer to the day it starts.
   */
  private isWithinWindow(
    now: Date,
    window: { start: string; end: string; daysOfWeek?: number[] },
    timeZone?: string,
  ): boolean {
    const toMinutes = (value: string): number | null => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const start = toMinutes(window.start);
    const end = toMinutes(window.end);
    if (start === null || end === null) return false;

    const { day, minutes } = this.localTime(now, timeZone);
    const days = window.daysOfWeek;
    const dayAllowed = (d: number) => !days?.length || days.includes(d);

    if (start <= end) {
      return dayAllowed(day) && minutes >= start && minutes < end;
    }
    // Overnight: the late part belongs to today, the early part to yesterday.
    if (minutes >= start) return dayAllowed(day);
    if (minutes < end) return dayAllowed((day + 6) % 7);
    return false;
  }

  private localTime(
    now: Date,
    timeZone?: string,
  ): { day: number; minutes: number } {
    let zone = "UTC";
    if (timeZone && isValidTimeZone(timeZone)) zone = timeZone;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      day: Math.max(0, weekdays.indexOf(get("weekday") ?? "Sun")),
      minutes: Number(get("hour") ?? 0) * 60 + Number(get("minute") ?? 0),
    };
  }

  private async evaluateFrequency(input: {
    tenantId: string;
    sdkIntegrationId?: string;
    environment?: DataEnvironment;
    guideId: string;
    userId?: string;
    sessionId?: string;
    rules: FrequencyRules;
    now: Date;
    forceShowCompleted?: boolean;
  }): Promise<ConditionEvaluation> {
    const userFilter = {
      tenantId: input.tenantId,
      ...environmentFilter(input.environment),
      ...(input.sdkIntegrationId
        ? { sdkIntegrationId: input.sdkIntegrationId }
        : {}),
      guideId: input.guideId,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(!input.userId && input.sessionId
        ? { sessionId: input.sessionId }
        : {}),
    };
    const [latestExposure, sessionExposure, exposures] = await Promise.all([
      GuideExposureModel.findOne(userFilter).sort({ lastShownAt: -1 }).exec(),
      input.sessionId
        ? GuideExposureModel.findOne({
            ...userFilter,
            sessionId: input.sessionId,
          }).exec()
        : Promise.resolve(null),
      GuideExposureModel.find(userFilter).select("displayCount").lean().exec(),
    ]);
    const exposure = sessionExposure ?? latestExposure;
    const totalDisplayCount = exposures.reduce(
      (sum, item) => sum + (item.displayCount ?? 0),
      0,
    );

    if (input.forceShowCompleted) {
      return {
        matched: true,
        reason: "Bypassed frequency evaluation due to forceShowCompleted flag",
      };
    }

    if (!exposure) {
      return { matched: true, reason: "No previous exposure" };
    }

    const hasCompletedOrDismissed =
      (latestExposure &&
        ["completed", "dismissed", "abandoned"].includes(
          latestExposure.status,
        )) ||
      (sessionExposure &&
        ["completed", "dismissed", "abandoned"].includes(
          sessionExposure.status,
        ));

    if (hasCompletedOrDismissed) {
      return {
        matched: false,
        reason: `Frequency cap: already completed, dismissed, or abandoned`,
      };
    }

    if (input.rules.showOnceEver && totalDisplayCount > 0) {
      return { matched: false, reason: "Frequency cap: shown once ever" };
    }

    if (
      input.rules.showOncePerSession &&
      input.sessionId &&
      sessionExposure?.displayCount
    ) {
      return {
        matched: false,
        reason: "Frequency cap: shown once per session",
      };
    }

    if (
      typeof input.rules.maxDisplays === "number" &&
      totalDisplayCount >= input.rules.maxDisplays
    ) {
      return { matched: false, reason: "Frequency cap: max displays reached" };
    }

    const lastShownAt =
      latestExposure?.lastShownAt ?? latestExposure?.updatedAt;
    if (!lastShownAt) {
      return { matched: true, reason: "No last shown timestamp" };
    }

    if (
      typeof input.rules.everyXDays === "number" &&
      input.now.getTime() - lastShownAt.getTime() <
        input.rules.everyXDays * 86400000
    ) {
      return { matched: false, reason: "Frequency cap: every X days" };
    }

    if (
      typeof input.rules.cooldownHours === "number" &&
      input.now.getTime() - lastShownAt.getTime() <
        input.rules.cooldownHours * 3600000
    ) {
      return { matched: false, reason: "Frequency cap: cooldown" };
    }

    return { matched: true, reason: "Frequency matched" };
  }

  private accountAgeDays(value: string | Date | undefined): number | undefined {
    const createdAt = this.toDate(value);

    if (!createdAt) {
      return undefined;
    }

    return Math.floor((Date.now() - createdAt.getTime()) / 86400000);
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}

export default new TargetingService();
