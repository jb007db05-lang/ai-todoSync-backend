import type { GuideAnalyticsSummaryDto } from "./dtos.js";
import guideAnalyticsRepository from "./repository.js";
import type { DataEnvironment } from "../../shared/environment.js";

class GuideAnalyticsService {
  public async summary(
    sdkIntegrationId: string,
    month: string,
    environment: DataEnvironment = "live",
  ): Promise<GuideAnalyticsSummaryDto> {
    const [
      totalGuides,
      liveGuides,
      exposures,
      totalSurveys,
      responses,
      mtu,
      events,
    ] = await Promise.all([
      guideAnalyticsRepository.countGuides(sdkIntegrationId),
      guideAnalyticsRepository.countLiveGuides(sdkIntegrationId),
      guideAnalyticsRepository.exposureTotals(sdkIntegrationId, environment),
      guideAnalyticsRepository.countSurveys(sdkIntegrationId),
      guideAnalyticsRepository.responseTotals(sdkIntegrationId, environment),
      // Sandbox traffic is never billed, so it has no MTU.
      environment === "live"
        ? guideAnalyticsRepository.countMtu(sdkIntegrationId, month)
        : Promise.resolve(0),
      guideAnalyticsRepository.aggregateEngagementEvents(
        sdkIntegrationId,
        environment,
      ),
    ]);

    const summary = {
      environment,
      guides: {
        total: totalGuides,
        live: liveGuides,
        impressions: exposures.impressions,
        completions: exposures.completions,
        dismissals: exposures.dismissals,
        completionRate:
          exposures.exposures > 0
            ? exposures.completions / exposures.exposures
            : 0,
        dismissalRate:
          exposures.exposures > 0
            ? exposures.dismissals / exposures.exposures
            : 0,
      },
      surveys: {
        total: totalSurveys,
        responses: responses.responses,
        nps:
          responses.responses > 0
            ? ((responses.promoters - responses.detractors) /
                responses.responses) *
              100
            : 0,
        promoters: responses.promoters,
        passives: responses.passives,
        detractors: responses.detractors,
      },
      mtu: {
        month,
        users: mtu,
      },
      events,
    };

    // Snapshots are the live record of the month.
    if (environment === "live") {
      await guideAnalyticsRepository.writeSnapshot({
        sdkIntegrationId,
        period: month,
        metrics: summary,
      });
    }

    return summary;
  }
}

export default new GuideAnalyticsService();
