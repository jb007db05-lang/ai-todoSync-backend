import mongoose, { ClientSession } from "mongoose";
import logger from "../lib/logger.js";

/**
 * Executes a callback within a MongoDB transaction if transactions are supported.
 * Falls back to non-transactional execution on standalone instances.
 *
 * MongoDB transactions require a replica set. Standalone instances (common in local dev)
 * do not support them and throw "Transaction numbers are only allowed on a replica set member or mongos".
 */
export async function runInTransaction<T>(
  callback: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  const client = mongoose.connection.getClient();

  // Topology types: 'Single', 'ReplicaSetWithPrimary', 'Sharded', etc.
  // Sessions/Transactions are NOT supported on 'Single' (standalone).
  const topologyType = (client as any).topology?.description?.type;
  const supportsTransactions =
    topologyType === "ReplicaSetWithPrimary" ||
    topologyType === "Sharded" ||
    topologyType === "ReplicaSetNoPrimary";

  if (!supportsTransactions) {
    if (process.env.NODE_ENV !== "production") {
      logger.info(
        `MongoDB transactions not supported (topology: ${topologyType}). Falling back to non-transactional execution.`,
      );
    }
    return callback(undefined);
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
