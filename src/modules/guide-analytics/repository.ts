import AnalyticsEventRegistryModel from "../analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../analytics/models/analytics-log.model.js";
import {
  GuideExposureModel,
  MonthlyTargetedUserModel,
} from "../engagement/model.js";
import GuideModel from "../guides/model.js";
import { SurveyModel, SurveyResponseModel } from "../surveys/model.js";
import GuideAnalyticsSnapshotModel from "./model.js";

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

  public listExposures(sdkIntegrationId: string) {
    return GuideExposureModel.find({ sdkIntegrationId }).lean().exec();
  }

  public countSurveys(sdkIntegrationId: string) {
    return SurveyModel.countDocuments({ sdkIntegrationId }).exec();
  }

  public listSurveyResponses(sdkIntegrationId: string) {
    return SurveyResponseModel.find({ sdkIntegrationId }).lean().exec();
  }

  public countMtu(sdkIntegrationId: string, month: string) {
    return MonthlyTargetedUserModel.countDocuments({
      sdkIntegrationId,
      month,
    }).exec();
  }

  public async aggregateEngagementEvents(sdkIntegrationId: string) {
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
