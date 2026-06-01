import AnalyticsEventRegistryModel from "../../models/analytics-event-registry.model.js";
import AnalyticsKeyModel from "../../models/analytics-key.model.js";
import AnalyticsLogModel from "../../models/analytics-log.model.js";
import {
  GuideExposureModel,
  MonthlyTargetedUserModel,
} from "../engagement/model.js";
import GuideModel from "../guides/model.js";
import { SurveyModel, SurveyResponseModel } from "../surveys/model.js";
import GuideAnalyticsSnapshotModel from "./model.js";

class GuideAnalyticsRepository {
  public countGuides(tenantId: string) {
    return GuideModel.countDocuments({ tenantId }).exec();
  }

  public countLiveGuides(tenantId: string) {
    return GuideModel.countDocuments({ tenantId, status: "LIVE" }).exec();
  }

  public listExposures(tenantId: string) {
    return GuideExposureModel.find({ tenantId }).lean().exec();
  }

  public countSurveys(tenantId: string) {
    return SurveyModel.countDocuments({ tenantId }).exec();
  }

  public listSurveyResponses(tenantId: string) {
    return SurveyResponseModel.find({ tenantId }).lean().exec();
  }

  public countMtu(tenantId: string, month: string) {
    return MonthlyTargetedUserModel.countDocuments({ tenantId, month }).exec();
  }

  public async aggregateEngagementEvents(tenantId: string) {
    const keys = await AnalyticsKeyModel.find({
      userId: tenantId,
      status: "active",
    })
      .select("_id")
      .lean()
      .exec();
    const apiKeyIds = keys.map((key) => key._id.toString());

    if (apiKeyIds.length === 0) {
      return [];
    }

    const registries = await AnalyticsEventRegistryModel.find({
      apiKeyId: { $in: apiKeyIds },
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
          apiKeyId: { $in: apiKeyIds },
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
    tenantId: string;
    period: string;
    metrics: Record<string, unknown>;
  }) {
    return GuideAnalyticsSnapshotModel.findOneAndUpdate(
      { tenantId: input.tenantId, period: input.period },
      { $set: { metrics: input.metrics } },
      { upsert: true, new: true },
    ).exec();
  }
}

export default new GuideAnalyticsRepository();
