import type { GuideAnalyticsQueryDto } from "./dtos.js";

export const validateGuideAnalyticsQueryDto = (
  query: Record<string, unknown>,
): GuideAnalyticsQueryDto => ({
  month: typeof query.month === "string" ? query.month : undefined,
});
