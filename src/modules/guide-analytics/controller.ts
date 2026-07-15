import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import { getTenantIdFromRequest } from "./permissions.js";
import guideAnalyticsService from "./service.js";
import { validateGuideAnalyticsQueryDto } from "./validators.js";

class GuideAnalyticsController {
  public summary = async (req: Request, res: Response): Promise<void> => {
    try {
      const sdkIntegrationId = String(req.params.sdkIntegrationId);
      const now = new Date();
      const query = validateGuideAnalyticsQueryDto(req.query);
      const month =
        query.month ??
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const summary = await guideAnalyticsService.summary(
        sdkIntegrationId,
        month,
      );
      res.status(200).json({ data: summary });
    } catch (error) {
      this.respondError(res, error);
    }
  };

  private respondError(res: Response, error: unknown): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }

    res.status(500).json({ error: "Guide analytics request failed" });
  }
}

export default new GuideAnalyticsController();
