import AnalyticsEventRegistryModel from "../analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../analytics/models/analytics-log.model.js";
import {
  GuideExposureModel,
  MonthlyTargetedUserModel,
} from "../engagement/model.js";
import GuideModel from "../guides/model.js";
import { SurveyModel, SurveyResponseModel } from "../surveys/model.js";
import GuideAnalyticsSnapshotModel from "./model.js";
import {
  environmentFilter,
  type DataEnvironment,
} from "../../shared/environment.js";

export interface ExposureTotals {
  exposures: number;
  impressions: number;
  completions: number;
  dismissals: number;
}

export interface ResponseTotals {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
}

class GuideAnalyticsRepository {
  public countGuides(sdkIntegrationId: string) {
    return GuideModel.countDocuments({ sdkIntegrationId }).exec();
  }

  public countLiveGuides(sdkIntegrationId: string) {
    return GuideModel.countDocuments({
      sdkIntegrationId,
      status: "LIVE",
    }).exec();
  }

  /** Guide exposures only (survey/checklist exposures use prefixed ids). */
  public async exposureTotals(
    sdkIntegrationId: string,
    environment: DataEnvironment,
  ): Promise<ExposureTotals> {
    const [row] = await GuideExposureModel.aggregate<ExposureTotals>([
      {
        $match: {
          sdkIntegrationId,
          ...environmentFilter(environment),
          guideId: { $not: /^(survey|checklist):/ },
        },
      },
      {
        $group: {
          _id: null,
          exposures: { $sum: 1 },
          impressions: { $sum: { $ifNull: ["$displayCount", 0] } },
          completions: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          dismissals: {
            $sum: { $cond: [{ $eq: ["$status", "dismissed"] }, 1, 0] },
          },
        },
      },
    ]).exec();
    return (
      row ?? { exposures: 0, impressions: 0, completions: 0, dismissals: 0 }
    );
  }

  public countSurveys(sdkIntegrationId: string) {
    return SurveyModel.countDocuments({ sdkIntegrationId }).exec();
  }

  public async responseTotals(
    sdkIntegrationId: string,
    environment: DataEnvironment,
  ): Promise<ResponseTotals> {
    const [row] = await SurveyResponseModel.aggregate<ResponseTotals>([
      { $match: { sdkIntegrationId, ...environmentFilter(environment) } },
      {
        $group: {
          _id: null,
          responses: { $sum: 1 },
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
    ]).exec();
    return row ?? { responses: 0, promoters: 0, passives: 0, detractors: 0 };
  }

  public countMtu(sdkIntegrationId: string, month: string) {
    return MonthlyTargetedUserModel.countDocuments({
      sdkIntegrationId,
      month,
    }).exec();
  }

  public async aggregateEngagementEvents(
    sdkIntegrationId: string,
    environment: DataEnvironment,
  ) {
    const registries = await AnalyticsEventRegistryModel.find({
      sdkIntegrationId,
      eventName: {
        $in: [
          "guide_shown",
          "guide_started",
          "guide_completed",
          "guide_dismissed",
          "step_viewed",
          "step_completed",
          "step_dropped",
          "survey_started",
          "survey_completed",
          "survey_abandoned",
          "banner_clicked",
          "hotspot_opened",
        ],
      },
    })
      .select("_id eventName")
      .lean()
      .exec();
    const eventNameByRef = new Map(
      registries.map((registry) => [
        registry._id.toString(),
        registry.eventName,
      ]),
    );

    if (eventNameByRef.size === 0) {
      return [];
    }

    const logs = await AnalyticsLogModel.aggregate<{
      _id: string;
      count: number;
    }>([
      {
        $match: {
          sdkIntegrationId,
          ...environmentFilter(environment),
          eventRef: { $in: [...eventNameByRef.keys()] },
        },
      },
      { $group: { _id: "$eventRef", count: { $sum: 1 } } },
    ]).exec();

    return logs.map((log) => ({
      eventName: eventNameByRef.get(log._id) ?? "unknown",
      count: log.count,
    }));
  }

  public writeSnapshot(input: {
    sdkIntegrationId: string;
    period: string;
    metrics: Record<string, unknown>;
  }) {
    return GuideAnalyticsSnapshotModel.findOneAndUpdate(
      { sdkIntegrationId: input.sdkIntegrationId, period: input.period },
      { $set: { metrics: input.metrics } },
      { upsert: true, new: true },
    ).exec();
  }
}

export default new GuideAnalyticsRepository();
