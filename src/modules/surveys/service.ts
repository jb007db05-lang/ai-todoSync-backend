import { AppError } from "../../utils/app-error.js";
import engagementService from "../engagement/service.js";
import type { RuntimeGuideDto } from "../engagement/dtos.js";
import type {
  GuideStatus,
  NpsCategory,
  TargetingRuntimeContext,
} from "../engagement/types.js";
import { GuideExposureModel } from "../engagement/model.js";
import { assertStatusTransition, isObjectId } from "../engagement/lifecycle.js";
import targetingService from "../targeting/service.js";
import {
  environmentFilter,
  servableStatuses,
  type DataEnvironment,
} from "../../shared/environment.js";
import type {
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
  SurveyResponseQueryDto,
  UpdateSurveyDto,
} from "./dtos.js";
import { SurveyResponseModel, type ISurveyDocument } from "./model.js";
import surveyRepository from "./repository.js";
import { assertSurveyPublishable, validateSurveyAnswers } from "./answers.js";

const NUMERIC_QUESTION_TYPES = [
  "NPS",
  "RATING_SCALE",
  "OPINION_SCALE",
  "CSAT",
  "CES",
];

/** Statuses that still accept responses: what the environment serves, plus PAUSED (users mid-survey). */
const acceptingStatuses = (environment: DataEnvironment): string[] => [
  ...servableStatuses(environment),
  "PAUSED",
];

const isDuplicateKeyError = (error: unknown): boolean =>
  (error as { code?: number } | undefined)?.code === 11000;

class SurveyService {
  public listSurveys(
    tenantId: string,
    sdkIntegrationId: string,
    query: SurveyQueryDto,
  ) {
    return surveyRepository.listSurveys(tenantId, sdkIntegrationId, query);
  }

  public async listResponses(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
    environment: DataEnvironment = "live",
    page: SurveyResponseQueryDto = { page: 1, limit: 50 },
  ) {
    await this.getSurvey(tenantId, sdkIntegrationId, surveyId);
    const { responses, total } = await surveyRepository.listResponses(
      tenantId,
      sdkIntegrationId,
      surveyId,
      environment,
      page,
    );
    return {
      responses,
      total,
      page: page.page,
      limit: page.limit,
      totalPages: Math.max(1, Math.ceil(total / page.limit)),
      environment,
    };
  }

  public async getSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
  ) {
    const survey = isObjectId(surveyId)
      ? await surveyRepository.getSurvey(tenantId, sdkIntegrationId, surveyId)
      : null;

    if (!survey) {
      throw new AppError(404, "Survey not found", "NOT_FOUND");
    }

    return survey;
  }

  public createSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    createdBy: string,
    dto: CreateSurveyDto,
  ) {
    const status = dto.status ?? "DRAFT";
    if (status === "LIVE") {
      assertSurveyPublishable(dto.questions ?? []);
    } else if (status !== "DRAFT") {
      throw new AppError(
        400,
        "New surveys start as DRAFT or LIVE.",
        "INVALID_STATUS",
      );
    }
    return surveyRepository.createSurvey(
      tenantId,
      sdkIntegrationId,
      createdBy,
      {
        ...dto,
        status,
      },
    );
  }

  public async updateSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
    updatedBy: string,
    dto: UpdateSurveyDto,
  ) {
    const existing = await this.getSurvey(tenantId, sdkIntegrationId, surveyId);
    const nextStatus: GuideStatus = dto.status ?? existing.status;
    const statusChanges = nextStatus !== existing.status;

    if (statusChanges) {
      assertStatusTransition("Survey", existing.status, nextStatus);
    }
    if (nextStatus === "LIVE") {
      assertSurveyPublishable(dto.questions ?? existing.questions);
    }

    const survey = await surveyRepository.updateSurvey(
      tenantId,
      sdkIntegrationId,
      surveyId,
      updatedBy,
      dto,
      statusChanges ? existing.status : undefined,
    );

    if (!survey) {
      throw new AppError(
        409,
        "Survey changed while updating. Reload and try again.",
        "STATUS_CONFLICT",
      );
    }

    return survey;
  }

  public async deleteSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
  ) {
    const existing = await this.getSurvey(tenantId, sdkIntegrationId, surveyId);
    if (existing.status === "LIVE") {
      throw new AppError(
        409,
        "Pause or archive a live survey before deleting it.",
        "SURVEY_LIVE",
      );
    }
    const result = await surveyRepository.deleteSurvey(
      tenantId,
      sdkIntegrationId,
      surveyId,
    );

    if (result.deletedCount === 0) {
      throw new AppError(404, "Survey not found", "NOT_FOUND");
    }
  }

  /**
   * Stores a validated response. With an idempotency key, a retried
   * submission returns the original response instead of a duplicate.
   */
  public async submitResponse(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
    dto: SubmitSurveyResponseDto,
    environment: DataEnvironment = "live",
  ) {
    const survey = await this.getSurvey(tenantId, sdkIntegrationId, surveyId);
    if (!acceptingStatuses(environment).includes(survey.status)) {
      throw new AppError(
        409,
        `This survey is ${survey.status.toLowerCase()} and is not accepting responses.`,
        "SURVEY_CLOSED",
      );
    }

    if (dto.idempotencyKey) {
      const existing = await surveyRepository.findResponseByIdempotencyKey(
        sdkIntegrationId,
        surveyId,
        dto.idempotencyKey,
      );
      if (existing) return { response: existing, duplicate: true };
    }

    const answers = validateSurveyAnswers(survey.questions, dto.answers);
    const npsScore = this.extractNpsScore(survey, answers);
    const category = this.categorizeNps(npsScore);

    let response;
    try {
      response = await surveyRepository.createResponse({
        tenantId,
        sdkIntegrationId,
        environment,
        survey,
        answers,
        userId: dto.userId,
        sessionId: dto.sessionId,
        idempotencyKey: dto.idempotencyKey,
        metadata: dto.metadata,
        npsScore,
        category,
      });
    } catch (error) {
      // A concurrent retry with the same key won the race.
      if (dto.idempotencyKey && isDuplicateKeyError(error)) {
        const existing = await surveyRepository.findResponseByIdempotencyKey(
          sdkIntegrationId,
          surveyId,
          dto.idempotencyKey,
        );
        if (existing) return { response: existing, duplicate: true };
      }
      throw error;
    }

    await engagementService.recordInteraction({
      tenantId,
      sdkIntegrationId,
      environment,
      actorUserId: dto.userId,
      dto: {
        eventName: "survey_completed",
        surveyId,
        userId: dto.userId,
        sessionId: dto.sessionId,
        properties: {
          npsScore,
          category,
          responseId: response._id.toString(),
        },
      },
    });

    return { response, duplicate: false };
  }

  public async getEligibleSurveys(
    tenantId: string,
    sdkIntegrationId: string,
    context: Omit<TargetingRuntimeContext, "tenantId">,
  ): Promise<RuntimeGuideDto[]> {
    const statuses = servableStatuses(context.environment ?? "live");
    const manualTourId = context.eventProperties?.tourId;
    if (
      context.eventName === "manual_tour" &&
      typeof manualTourId === "string"
    ) {
      const cleanTourId = manualTourId.replace(/^survey:/, "");
      const survey = isObjectId(cleanTourId)
        ? await surveyRepository.getSurvey(
            tenantId,
            sdkIntegrationId,
            cleanTourId,
          )
        : null;
      // Manual triggers obey the same status rules as automatic delivery.
      if (survey && statuses.includes(survey.status)) {
        return [
          this.toRuntimeDto(survey, {
            reasons: ["Manual tour trigger"],
            matchedConditions: [],
            failedConditions: [],
          }),
        ];
      }
    }

    const surveys = await surveyRepository.listServableSurveys(
      tenantId,
      sdkIntegrationId,
      statuses,
    );
    const contextWithTenant = { ...context, tenantId };
    const evaluated = await Promise.all(
      surveys.map(async (survey) => {
        const [targeting, trigger] = await Promise.all([
          targetingService.evaluate({
            rules: survey.targetingRules,
            context: contextWithTenant,
            guideId: `survey:${survey._id.toString()}`,
            frequencyRules: survey.frequencyRules,
            scheduleRules: survey.scheduleRules,
          }),
          targetingService.evaluate({
            rules: survey.triggerRules,
            context: contextWithTenant,
          }),
        ]);

        return {
          survey,
          eligibility: {
            eligible: targeting.eligible && trigger.eligible,
            reasons: [...targeting.reasons, ...trigger.reasons],
            matchedConditions: [
              ...targeting.matchedConditions,
              ...trigger.matchedConditions,
            ],
            failedConditions: [
              ...targeting.failedConditions,
              ...trigger.failedConditions,
            ],
          },
        };
      }),
    );

    return evaluated
      .filter((entry) => entry.eligibility.eligible)
      .sort((left, right) =>
        targetingService.comparePriority(
          left.survey.priority,
          right.survey.priority,
        ),
      )
      .map((entry) => this.toRuntimeDto(entry.survey, entry.eligibility));
  }

  /**
   * Survey analytics computed in the database, so cost does not grow with
   * the number of responses held in memory.
   */
  public async getSurveyAnalytics(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
    environment: DataEnvironment = "live",
  ) {
    const survey = await this.getSurvey(tenantId, sdkIntegrationId, surveyId);
    const responseMatch = {
      tenantId,
      sdkIntegrationId,
      surveyId,
      ...environmentFilter(environment),
    };

    const [responseFacets] = await SurveyResponseModel.aggregate<{
      totals: Array<{
        submissions: number;
        promoters: number;
        passives: number;
        detractors: number;
      }>;
      answers: Array<{ _id: { q: string; v: unknown }; count: number }>;
      durations: Array<{ total: number; count: number }>;
      weekly: Array<{
        _id: string;
        responses: number;
        promoters: number;
        detractors: number;
      }>;
      monthly: Array<{
        _id: string;
        responses: number;
        promoters: number;
        detractors: number;
      }>;
    }>([
      { $match: responseMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                submissions: { $sum: 1 },
                promoters: {
                  $sum: { $cond: [{ $eq: ["$category", "PROMOTER"] }, 1, 0] },
                },
                passives: {
                  $sum: { $cond: [{ $eq: ["$category", "PASSIVE"] }, 1, 0] },
                },
                detractors: {
                  $sum: { $cond: [{ $eq: ["$category", "DETRACTOR"] }, 1, 0] },
                },
              },
            },
          ],
          answers: [
            { $unwind: "$answers" },
            { $match: { "answers.value": { $ne: null } } },
            {
              $group: {
                _id: { q: "$answers.questionId", v: "$answers.value" },
                count: { $sum: 1 },
              },
            },
          ],
          durations: [
            {
              $project: {
                seconds: {
                  $divide: [
                    {
                      $subtract: [
                        "$submittedAt",
                        {
                          $convert: {
                            input: "$metadata.startedAt",
                            to: "date",
                            onError: null,
                            onNull: null,
                          },
                        },
                      ],
                    },
                    1000,
                  ],
                },
              },
            },
            { $match: { seconds: { $gt: 0 } } },
            {
              $group: {
                _id: null,
                total: { $sum: "$seconds" },
                count: { $sum: 1 },
              },
            },
          ],
          weekly: this.trendStages("%G-W%V"),
          monthly: this.trendStages("%Y-%m"),
        },
      },
    ]).exec();

    const [exposureStats] = await GuideExposureModel.aggregate<{
      impressions: number;
      users: string[];
      starts: number;
      dismissals: number;
      durationTotal: number;
      durationCount: number;
    }>([
      {
        $match: {
          sdkIntegrationId,
          guideId: `survey:${surveyId}`,
          ...environmentFilter(environment),
        },
      },
      {
        $group: {
          _id: null,
          impressions: { $sum: { $ifNull: ["$displayCount", 0] } },
          users: { $addToSet: "$userId" },
          starts: { $sum: { $cond: [{ $ne: ["$status", "shown"] }, 1, 0] } },
          dismissals: {
            $sum: {
              $cond: [{ $in: ["$status", ["dismissed", "abandoned"]] }, 1, 0],
            },
          },
          durationTotal: {
            $sum: {
              $cond: [
                { $and: ["$startedAt", "$completedAt"] },
                {
                  $divide: [
                    { $subtract: ["$completedAt", "$startedAt"] },
                    1000,
                  ],
                },
                0,
              ],
            },
          },
          durationCount: {
            $sum: { $cond: [{ $and: ["$startedAt", "$completedAt"] }, 1, 0] },
          },
        },
      },
    ]).exec();

    const totals = responseFacets?.totals[0] ?? {
      submissions: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
    };
    const submissions = totals.submissions;
    const impressions = exposureStats?.impressions ?? 0;
    const starts = exposureStats?.starts ?? 0;
    const uniqueUsers = (exposureStats?.users ?? []).filter(Boolean).length;

    const exposureDuration = exposureStats?.durationCount
      ? exposureStats.durationTotal / exposureStats.durationCount
      : 0;
    const responseDuration = responseFacets?.durations[0]?.count
      ? responseFacets.durations[0].total / responseFacets.durations[0].count
      : 0;

    const answersByQuestion = new Map<
      string,
      Array<{ value: unknown; count: number }>
    >();
    for (const row of responseFacets?.answers ?? []) {
      const list = answersByQuestion.get(row._id.q) ?? [];
      list.push({ value: row._id.v, count: row.count });
      answersByQuestion.set(row._id.q, list);
    }

    const questionAnalytics = survey.questions.map((q) => {
      const rows = answersByQuestion.get(q.id) ?? [];
      const distribution: Record<string, number> = {};
      let answeredCount = 0;
      let numericSum = 0;
      let numericCount = 0;

      for (const { value, count } of rows) {
        answeredCount += count;
        const key =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value);
        distribution[key] = (distribution[key] ?? 0) + count;
        const num = Number(value);
        if (NUMERIC_QUESTION_TYPES.includes(q.type) && Number.isFinite(num)) {
          numericSum += num * count;
          numericCount += count;
        }
      }

      const ranked = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
      return {
        questionId: q.id,
        title: q.title,
        type: q.type,
        responseCount: answeredCount,
        skippedCount: Math.max(0, submissions - answeredCount),
        averageScore: numericCount > 0 ? numericSum / numericCount : 0,
        distribution,
        mostSelectedOption: ranked[0]?.[0] ?? null,
        leastSelectedOption: ranked[ranked.length - 1]?.[0] ?? null,
      };
    });

    const toTrend = (
      rows: Array<{
        _id: string;
        responses: number;
        promoters: number;
        detractors: number;
      }> = [],
    ) =>
      rows.map((row) => ({
        period: row._id,
        responses: row.responses,
        nps:
          row.responses > 0
            ? ((row.promoters - row.detractors) / row.responses) * 100
            : 0,
      }));

    return {
      surveyId,
      environment,
      responses: submissions,
      nps:
        submissions > 0
          ? ((totals.promoters - totals.detractors) / submissions) * 100
          : 0,
      promoters: totals.promoters,
      passives: totals.passives,
      detractors: totals.detractors,
      responseRate: impressions > 0 ? (submissions / impressions) * 100 : 0,
      impressions,
      eligibleUsers: uniqueUsers,
      displays: impressions,
      starts,
      submissions,
      dismissals: exposureStats?.dismissals ?? 0,
      completionRate: impressions > 0 ? (submissions / impressions) * 100 : 0,
      dropOffRate:
        starts > 0 ? (Math.max(0, starts - submissions) / starts) * 100 : 0,
      averageCompletionTime: exposureDuration || responseDuration,
      questionAnalytics,
      weeklyTrends: toTrend(responseFacets?.weekly),
      monthlyTrends: toTrend(responseFacets?.monthly),
    };
  }

  private trendStages(format: string) {
    return [
      {
        $group: {
          _id: {
            $dateToString: { format, date: "$submittedAt", timezone: "UTC" },
          },
          responses: { $sum: 1 },
          promoters: {
            $sum: { $cond: [{ $eq: ["$category", "PROMOTER"] }, 1, 0] },
          },
          detractors: {
            $sum: { $cond: [{ $eq: ["$category", "DETRACTOR"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 as const } },
    ];
  }

  private toRuntimeDto(
    survey: ISurveyDocument,
    eligibility: RuntimeGuideDto["eligibility"],
  ): RuntimeGuideDto {
    return {
      id: `survey:${survey._id.toString()}`,
      title: survey.title,
      description: survey.description,
      type: "SURVEY",
      priority: survey.priority,
      theme: {},
      steps: survey.questions,
      targetingRules: survey.targetingRules,
      frequencyRules: survey.frequencyRules as Record<string, unknown>,
      scheduleRules: survey.scheduleRules as Record<string, unknown>,
      metadata: {
        ...survey.metadata,
        surveyId: survey._id.toString(),
        sdkIntegrationId: survey.sdkIntegrationId,
        status: survey.status,
      },
      eligibility,
    };
  }

  private extractNpsScore(
    survey: ISurveyDocument,
    answers: Record<string, unknown>,
  ): number | null {
    const npsQuestion = survey.questions.find(
      (question) => question.type === "NPS",
    );
    if (!npsQuestion) {
      return null;
    }
    const value = answers[npsQuestion.id];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private categorizeNps(score: number | null): NpsCategory {
    if (score == null) {
      return "NONE";
    }

    if (score >= 9) {
      return "PROMOTER";
    }

    if (score >= 7) {
      return "PASSIVE";
    }

    return "DETRACTOR";
  }
}

export default new SurveyService();
