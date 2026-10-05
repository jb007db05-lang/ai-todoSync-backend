import type {
  CreateSurveyDto,
  SurveyQueryDto,
  UpdateSurveyDto,
} from "./dtos.js";
import {
  SurveyModel,
  SurveyResponseModel,
  type ISurveyDocument,
} from "./model.js";
import type { NpsCategory } from "../engagement/types.js";
import {
  environmentFilter,
  escapeRegex,
  type DataEnvironment,
} from "../../shared/environment.js";

class SurveyRepository {
  public listSurveys(
    tenantId: string,
    sdkIntegrationId: string,
    query: SurveyQueryDto,
  ) {
    const filter: Record<string, unknown> = {
      tenantId,
      sdkIntegrationId,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.search) {
      const pattern = escapeRegex(query.search);
      filter.$or = [
        { title: { $regex: pattern, $options: "i" } },
        { description: { $regex: pattern, $options: "i" } },
      ];
    }

    return SurveyModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  public listServableSurveys(
    tenantId: string,
    sdkIntegrationId: string,
    statuses: string[],
  ) {
    return SurveyModel.find({
      tenantId,
      sdkIntegrationId,
      status: { $in: statuses },
    })
      .sort({ updatedAt: -1 })
      .exec();
  }

  public getSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
  ) {
    return SurveyModel.findOne({
      _id: surveyId,
      tenantId,
      sdkIntegrationId,
    }).exec();
  }

  public createSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    createdBy: string,
    dto: CreateSurveyDto,
  ) {
    return SurveyModel.create({
      ...dto,
      tenantId,
      sdkIntegrationId,
      createdBy,
      updatedBy: createdBy,
      analytics: {},
    });
  }

  /**
   * When `expectedStatus` is given the update only applies if the survey is
   * still in that status, so concurrent status changes cannot both win.
   */
  public updateSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
    updatedBy: string,
    dto: UpdateSurveyDto,
    expectedStatus?: string,
  ) {
    return SurveyModel.findOneAndUpdate(
      {
        _id: surveyId,
        tenantId,
        sdkIntegrationId,
        ...(expectedStatus ? { status: expectedStatus } : {}),
      },
      { $set: { ...dto, updatedBy } },
      { new: true },
    ).exec();
  }

  public deleteSurvey(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
  ) {
    return SurveyModel.deleteOne({
      _id: surveyId,
      tenantId,
      sdkIntegrationId,
    }).exec();
  }

  public findResponseByIdempotencyKey(
    sdkIntegrationId: string,
    surveyId: string,
    idempotencyKey: string,
  ) {
    return SurveyResponseModel.findOne({
      sdkIntegrationId,
      surveyId,
      idempotencyKey,
    }).exec();
  }

  public createResponse(input: {
    tenantId: string;
    sdkIntegrationId: string;
    environment: DataEnvironment;
    survey: ISurveyDocument;
    answers: Record<string, unknown>;
    userId?: string;
    sessionId?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    npsScore?: number | null;
    category: NpsCategory;
  }) {
    // Only answered questions are stored; answers are already validated.
    const answersArray = input.survey.questions
      .filter((q) => input.answers[q.id] !== undefined)
      .map((q) => ({
        questionId: q.id,
        questionTitle: q.title,
        questionType: q.type,
        value: input.answers[q.id],
      }));

    return SurveyResponseModel.create({
      tenantId: input.tenantId,
      sdkIntegrationId: input.sdkIntegrationId,
      environment: input.environment,
      idempotencyKey: input.idempotencyKey ?? null,
      surveyId: input.survey._id.toString(),
      userId: input.userId,
      sessionId: input.sessionId,
      answers: answersArray,
      npsScore: input.npsScore ?? null,
      category: input.category,
      metadata: input.metadata ?? {},
      submittedAt: new Date(),
    });
  }

  public async listResponses(
    tenantId: string,
    sdkIntegrationId: string,
    surveyId: string,
    environment: DataEnvironment,
    page: { page: number; limit: number },
  ) {
    const filter = {
      tenantId,
      sdkIntegrationId,
      surveyId,
      ...environmentFilter(environment),
    };
    const [responses, total] = await Promise.all([
      SurveyResponseModel.find(filter)
        .sort({ submittedAt: -1, _id: -1 })
        .skip((page.page - 1) * page.limit)
        .limit(page.limit)
        .lean()
        .exec(),
      SurveyResponseModel.countDocuments(filter).exec(),
    ]);
    return { responses, total };
  }
}

export default new SurveyRepository();
