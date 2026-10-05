import mongoose from "mongoose";
import { AppError } from "../../utils/app-error.js";
import type { GuideStatus } from "./types.js";

/**
 * Allowed status changes for guides and surveys:
 *
 *   DRAFT ──► LIVE ──► PAUSED ──► LIVE
 *     ▲         │         │
 *     │         ▼         ▼
 *     └──── ARCHIVED ◄────┘ (PAUSED can also go back to DRAFT)
 *
 * Archived content is restored to DRAFT, never straight to LIVE.
 */
const TRANSITIONS: Record<GuideStatus, GuideStatus[]> = {
  DRAFT: ["LIVE", "ARCHIVED"],
  LIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["LIVE", "DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export const canTransition = (from: GuideStatus, to: GuideStatus): boolean =>
  from === to || TRANSITIONS[from]?.includes(to) === true;

export const assertStatusTransition = (
  kind: "Guide" | "Survey",
  from: GuideStatus,
  to: GuideStatus,
): void => {
  if (!canTransition(from, to)) {
    throw new AppError(
      409,
      `${kind} cannot move from ${from} to ${to}. Allowed: ${TRANSITIONS[from].join(", ") || "none"}.`,
      "INVALID_STATUS_TRANSITION",
    );
  }
};

/** Avoids CastErrors (500s) on malformed ids; callers treat false as 404. */
export const isObjectId = (value: unknown): value is string =>
  typeof value === "string" &&
  mongoose.Types.ObjectId.isValid(value) &&
  /^[a-f0-9]{24}$/i.test(value);
