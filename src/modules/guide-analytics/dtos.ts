export interface GuideAnalyticsQueryDto {
  month?: string;
}

export interface GuideAnalyticsSummaryDto {
  guides: {
    total: number;
    live: number;
    impressions: number;
    completions: number;
    dismissals: number;
    completionRate: number;
    dismissalRate: number;
  };
  surveys: {
    total: number;
    responses: number;
    nps: number;
    promoters: number;
    passives: number;
    detractors: number;
  };
  mtu: {
    month: string;
    users: number;
  };
  events: Array<{
    eventName: string;
    count: number;
  }>;
}
