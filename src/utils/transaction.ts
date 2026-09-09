import mongoose, { ClientSession } from "mongoose";
import logger from "../lib/logger.js";

/**
 * Executes a callback within a MongoDB transaction if transactions are supported.
 * Falls back to non-transactional execution on standalone instances.
 *
 * MongoDB transactions require a replica set. Standalone instances (common in local dev)
 * do not support them and throw "Transaction numbers are only allowed on a replica set member or mongos".
 */
let fallbackLock = Promise.resolve();

export async function runInTransaction<T>(
  callback: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  let supportsTransactions = false;
  let topologyType = "unknown";

  try {
    const client = mongoose.connection.getClient();
    topologyType = (client as any).topology?.description?.type || "unknown";
    supportsTransactions =
      topologyType === "ReplicaSetWithPrimary" ||
      topologyType === "Sharded" ||
      topologyType === "ReplicaSetNoPrimary";
  } catch (_err) {
    logger.warn(
      "Could not determine MongoDB topology, defaulting to non-transactional mode",
    );
  }

  if (!supportsTransactions) {
    if (process.env.NODE_ENV === "development") {
      logger.debug(
        `MongoDB transactions not supported (topology: ${topologyType}). Using fallback.`,
      );
    }
    const resultPromise = fallbackLock.then(() => callback(undefined));
    fallbackLock = resultPromise.then(
      () => {},
      () => {},
    );
    return resultPromise;
  }

  const session = await mongoose.startSession();
  try {
    let result: T | undefined;

    // session.withTransaction handles startTransaction, commitTransaction, and abortTransaction
    // and also handles retries for TransientTransactionError and UnknownTransactionCommitResult.
    await session.withTransaction(async () => {
      result = await callback(session);
    });

    return result as T;
  } finally {
    await session.endSession();
  }
}
