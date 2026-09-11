import { randomBytes } from "crypto";
import type { ToolEntry } from "./tool-types.js";

interface PendingConfirmation {
  toolName: string;
  userId: string;
  expiresAt: number;
}

// In-memory confirmation token store (single-node MVP; upgrade to ioredis for multi-node)
const pendingConfirmations = new Map<string, PendingConfirmation>();

const TOKEN_TTL_MS = 60_000; // 60 seconds

/**
 * Check if a tool call needs confirmation and validate / issue tokens.
 * Returns null if the call may proceed, or a confirmation-required payload.
 */
export function checkConfirmation(
  entry: ToolEntry,
  userId: string,
  input: Record<string, unknown>,
): {
  confirmationRequired: true;
  confirmationToken: string;
  summary: string;
} | null {
  if (!entry.requiresConfirmation) {
    return null;
  }

  const providedToken = input._confirmationToken;

  if (typeof providedToken === "string" && providedToken.length > 0) {
    const pending = pendingConfirmations.get(providedToken);
    if (
      pending &&
      pending.toolName === entry.name &&
      pending.userId === userId &&
      Date.now() < pending.expiresAt
    ) {
      pendingConfirmations.delete(providedToken);
      return null; // Confirmed — proceed
    }
    // Invalid or expired token — issue a new one
  }

  // Issue a new confirmation token
  const token = randomBytes(24).toString("hex");
  pendingConfirmations.set(token, {
    toolName: entry.name,
    userId,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  // Evict expired tokens periodically
  evictExpiredTokens();

  return {
    confirmationRequired: true,
    confirmationToken: token,
    summary: buildSummary(entry, input),
  };
}

function buildSummary(
  entry: ToolEntry,
  input: Record<string, unknown>,
): string {
  const relevant = { ...input };
  delete relevant._confirmationToken;
  const inputPreview = JSON.stringify(relevant).slice(0, 200);
  return `Tool "${entry.name}" (risk: ${entry.risk}) requires confirmation before execution. Input: ${inputPreview}. Include _confirmationToken in next call to proceed (valid 60s).`;
}

function evictExpiredTokens(): void {
  const now = Date.now();
  for (const [token, pending] of pendingConfirmations.entries()) {
    if (now >= pending.expiresAt) {
      pendingConfirmations.delete(token);
    }
  }
}
