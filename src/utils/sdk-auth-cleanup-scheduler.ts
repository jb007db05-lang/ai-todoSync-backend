import cron from "node-cron";
import logger from "../lib/logger.js";
import { SdkAuthService } from "../services/sdkAuth.service.js";

// Run cleanup every 10 minutes
const CRON_EXPRESSION = "*/10 * * * *";

export const scheduleSdkAuthCleanupJob = (): cron.ScheduledTask => {
  logger.info("Scheduling SDK Auth cleanup job", {
    expression: CRON_EXPRESSION,
  });

  return cron.schedule(CRON_EXPRESSION, async () => {
    try {
      const stats = await SdkAuthService.runCleanupJob();
      if (stats.deletedSessions > 0 || stats.deletedNonces > 0) {
        logger.info("SDK Auth cleanup job completed successfully", stats);
      }
    } catch (error) {
      logger.error("SDK Auth cleanup job failed", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });
};
