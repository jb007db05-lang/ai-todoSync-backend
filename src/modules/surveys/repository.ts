import type {
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyQueryDto,
  UpdateSurveyDto,
} from "./dtos.js";
import {
  SurveyModel,
  SurveyResponseModel,
  type ISurveyDocument,
} from "./model.js";
import type { NpsCategory } from "../engagement/types.js";

class SurveyRepository {
  public listSurveys(tenantId: string, query: SurveyQueryDto) {
    const filter: Record<string, unknown> = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: "i" } },
        { description: { $regex: query.search, $options: "i" } },
      ];
    }

    return SurveyModel.find(filter).sort({ updatedAt: -1 }).exec();
  }

  public listLiveSurveys(tenantId: string) {
    return SurveyModel.find({ tenantId, status: "LIVE" })
      .sort({ updatedAt: -1 })
      .exec();
  }

  public getSurvey(tenantId: string, surveyId: string) {
    return SurveyModel.findOne({ _id: surveyId, tenantId }).exec();
  }

  public createSurvey(
    tenantId: string,
    createdBy: string,
    dto: CreateSurveyDto,
  ) {
    return SurveyModel.create({
      ...dto,
      tenantId,
      createdBy,
      updatedBy: createdBy,
      analytics: {},
    });
  }

  public updateSurvey(
    tenantId: string,
    surveyId: string,
    updatedBy: string,
    dto: UpdateSurveyDto,
  ) {
    return SurveyModel.findOneAndUpdate(
      { _id: surveyId, tenantId },
      { $set: { ...dto, updatedBy } },
      { new: true },
    ).exec();
  }

  public deleteSurvey(tenantId: string, surveyId: string) {
    return SurveyModel.deleteOne({ _id: surveyId, tenantId }).exec();
  }

  public createResponse(input: {
    tenantId: string;
    survey: ISurveyDocument;
    dto: SubmitSurveyResponseDto;
    npsScore?: number | null;
    category: NpsCategory;
  }) {
    return SurveyResponseModel.create({
      tenantId: input.tenantId,
      surveyId: input.survey._id.toString(),
      userId: input.dto.userId,
      sessionId: input.dto.sessionId,
      answers: input.dto.answers,
      npsScore: input.npsScore ?? null,
      category: input.category,
      metadata: input.dto.metadata ?? {},
      submittedAt: new Date(),
    });
  }

  public listResponses(tenantId: string, surveyId: string) {
    return SurveyResponseModel.find({ tenantId, surveyId })
      .sort({ submittedAt: -1 })
      .exec();
  }
}

export default new SurveyRepository();
