import type { GuideAnalyticsSummaryDto } from "./dtos.js";
import guideAnalyticsRepository from "./repository.js";

class GuideAnalyticsService {
  public async summary(
    tenantId: string,
    month: string,
  ): Promise<GuideAnalyticsSummaryDto> {
    const [
      totalGuides,
      liveGuides,
      exposures,
      totalSurveys,
      surveyResponses,
      mtu,
      events,
    ] = await Promise.all([
      guideAnalyticsRepository.countGuides(tenantId),
      guideAnalyticsRepository.countLiveGuides(tenantId),
      guideAnalyticsRepository.listExposures(tenantId),
      guideAnalyticsRepository.countSurveys(tenantId),
      guideAnalyticsRepository.listSurveyResponses(tenantId),
      guideAnalyticsRepository.countMtu(tenantId, month),
      guideAnalyticsRepository.aggregateEngagementEvents(tenantId),
    ]);

    const impressions = exposures.reduce(
      (sum, exposure) => sum + (exposure.displayCount ?? 0),
      0,
    );
    const completions = exposures.filter(
      (exposure) => exposure.status === "completed",
    ).length;
    const dismissals = exposures.filter(
      (exposure) => exposure.status === "dismissed",
    ).length;
    const promoters = surveyResponses.filter(
      (response) => response.category === "PROMOTER",
    ).length;
    const passives = surveyResponses.filter(
      (response) => response.category === "PASSIVE",
    ).length;
    const detractors = surveyResponses.filter(
      (response) => response.category === "DETRACTOR",
    ).length;
    const responseTotal = surveyResponses.length;
    const summary = {
      guides: {
        total: totalGuides,
        live: liveGuides,
        impressions,
        completions,
        dismissals,
        completionRate:
          exposures.length > 0 ? completions / exposures.length : 0,
        dismissalRate: exposures.length > 0 ? dismissals / exposures.length : 0,
      },
      surveys: {
        total: totalSurveys,
        responses: responseTotal,
        nps:
          responseTotal > 0
            ? ((promoters - detractors) / responseTotal) * 100
            : 0,
        promoters,
        passives,
        detractors,
      },
      mtu: {
        month,
        users: mtu,
      },
      events,
    };

    await guideAnalyticsRepository.writeSnapshot({
      tenantId,
      period: month,
      metrics: summary,
    });

    return summary;
  }
}

export default new GuideAnalyticsService();
