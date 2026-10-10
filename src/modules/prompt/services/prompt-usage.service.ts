import PromptLibraryModel from "../models/prompt-library.model.js";
import logger from "../../../lib/logger.js";

/**
 * Counts a use of a logical prompt (every version row shares the count) for
 * the Insights page. Best effort: a failed counter never breaks a run.
 */
export const recordPromptUse = (rootId: unknown): void => {
  if (!rootId) return;
  void PromptLibraryModel.updateMany(
    { $or: [{ _id: rootId }, { parentId: rootId }] },
    { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } },
  )
    .exec()
    .catch((err: unknown) =>
      logger.warn("Could not record prompt use", err as Error),
    );
};
