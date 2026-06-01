import { AppError } from "../../utils/app-error.js";
import engagementService from "../engagement/service.js";
import type { RuntimeGuideDto } from "../engagement/dtos.js";
import type {
  NpsCategory,
  TargetingRuntimeContext,
} from "../engagement/types.js";
import targetingService from "../targeting/service.js";
import type {
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
  UpdateSurveyDto,
} from "./dtos.js";
import type { ISurveyDocument } from "./model.js";
import surveyRepository from "./repository.js";

class SurveyService {
  public listSurveys(tenantId: string, query: SurveyQueryDto) {
    return surveyRepository.listSurveys(tenantId, query);
  }

  public async getSurvey(tenantId: string, surveyId: string) {
    const survey = await surveyRepository.getSurvey(tenantId, surveyId);

    if (!survey) {
      throw new AppError(404, "Survey not found", "NOT_FOUND");
    }

    return survey;
  }

  public createSurvey(
    tenantId: string,
    createdBy: string,
    dto: CreateSurveyDto,
  ) {
    return surveyRepository.createSurvey(tenantId, createdBy, dto);
  }

  public async updateSurvey(
    tenantId: string,
    surveyId: string,
    updatedBy: string,
    dto: UpdateSurveyDto,
  ) {
    const survey = await surveyRepository.updateSurvey(
      tenantId,
      surveyId,
      updatedBy,
      dto,
    );

    if (!survey) {
      throw new AppError(404, "Survey not found", "NOT_FOUND");
    }

    return survey;
  }

  public async deleteSurvey(tenantId: string, surveyId: string) {
    const result = await surveyRepository.deleteSurvey(tenantId, surveyId);

    if (result.deletedCount === 0) {
      throw new AppError(404, "Survey not found", "NOT_FOUND");
    }
  }

  public async submitResponse(
    tenantId: string,
    surveyId: string,
    dto: SubmitSurveyResponseDto,
  ) {
    const survey = await this.getSurvey(tenantId, surveyId);
    const npsScore = this.extractNpsScore(survey, dto.answers);
    const category = this.categorizeNps(npsScore);
    const response = await surveyRepository.createResponse({
      tenantId,
      survey,
      dto,
      npsScore,
      category,
    });

    await engagementService.recordInteraction({
      tenantId,
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

    return response;
  }

  public async getEligibleSurveys(
    tenantId: string,
    context: Omit<TargetingRuntimeContext, "tenantId">,
  ): Promise<RuntimeGuideDto[]> {
    const surveys = await surveyRepository.listLiveSurveys(tenantId);
    const contextWithTenant = { ...context, tenantId };
    const evaluated = await Promise.all(
      surveys.map(async (survey) => {
        const [targeting, trigger] = await Promise.all([
          targetingService.evaluate({
            rules: survey.targetingRules,
            context: contextWithTenant,
            guideId: survey._id.toString(),
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

  public async getSurveyAnalytics(tenantId: string, surveyId: string) {
    await this.getSurvey(tenantId, surveyId);
    const responses = await surveyRepository.listResponses(tenantId, surveyId);
    const promoters = responses.filter(
      (response) => response.category === "PROMOTER",
    ).length;
    const passives = responses.filter(
      (response) => response.category === "PASSIVE",
    ).length;
    const detractors = responses.filter(
      (response) => response.category === "DETRACTOR",
    ).length;
    const total = responses.length;
    const nps = total > 0 ? ((promoters - detractors) / total) * 100 : 0;

    return {
      surveyId,
      responses: total,
      nps,
      promoters,
      passives,
      detractors,
      responseRate: total,
      weeklyTrends: this.buildTrend(responses, "week"),
      monthlyTrends: this.buildTrend(responses, "month"),
    };
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
      metadata: { ...survey.metadata, surveyId: survey._id.toString() },
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

    const value = Number(answers[npsQuestion.id]);
    return Number.isFinite(value) ? value : null;
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

  private buildTrend(
    responses: Array<{ submittedAt: Date; category: NpsCategory }>,
    bucket: "week" | "month",
  ) {
    const groups = new Map<
      string,
      { total: number; promoters: number; detractors: number }
    >();

    responses.forEach((response) => {
      const date = response.submittedAt;
      const key =
        bucket === "month"
          ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
          : `${date.getUTCFullYear()}-W${String(this.weekOfYear(date)).padStart(2, "0")}`;
      const current = groups.get(key) ?? {
        total: 0,
        promoters: 0,
        detractors: 0,
      };
      current.total += 1;
      current.promoters += response.category === "PROMOTER" ? 1 : 0;
      current.detractors += response.category === "DETRACTOR" ? 1 : 0;
      groups.set(key, current);
    });

    return [...groups.entries()].map(([period, value]) => ({
      period,
      responses: value.total,
      nps:
        value.total > 0
          ? ((value.promoters - value.detractors) / value.total) * 100
          : 0,
    }));
  }

  private weekOfYear(date: Date): number {
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayOffset = Math.floor(
      (date.getTime() - firstDay.getTime()) / 86400000,
    );
    return Math.ceil((dayOffset + firstDay.getUTCDay() + 1) / 7);
  }
}

export default new SurveyService();
