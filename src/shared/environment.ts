import { AppError } from "../utils/app-error.js";

/**
 * Data environment of an SDK request. Every integration has a live key and,
 * optionally, a sandbox key (`sdk_test_…`). Sandbox traffic sees draft
 * content and its data (events, exposures, survey responses) is stored apart
 * from live data.
 */
export type DataEnvironment = "live" | "sandbox";

export const DATA_ENVIRONMENTS: readonly DataEnvironment[] = [
  "live",
  "sandbox",
] as const;

export const SANDBOX_KEY_PREFIX = "sdk_test_";
export const LIVE_KEY_PREFIX = "sdk_";

/**
 * Mongo filter for one environment. Documents written before environments
 * existed have no `environment` field and count as live.
 */
export const environmentFilter = (
  environment: DataEnvironment = "live",
): Record<string, unknown> =>
  environment === "sandbox"
    ? { environment: "sandbox" }
    : { environment: { $ne: "sandbox" } };

/** Parses an `environment` query/body value; absent means live. */
export const parseEnvironment = (value: unknown): DataEnvironment => {
  if (value === undefined || value === null || value === "") return "live";
  if (value === "live" || value === "sandbox") return value;
  throw new AppError(
    400,
    "environment must be 'live' or 'sandbox'",
    "INVALID_ENVIRONMENT",
  );
};

/** Identity namespace: sandbox users never merge with live users. */
export const scopedApiKeyId = (
  apiKeyId: string,
  environment: DataEnvironment,
): string => (environment === "sandbox" ? `${apiKeyId}:sandbox` : apiKeyId);

/**
 * Content statuses an environment may serve. Live traffic only ever sees LIVE
 * content; sandbox traffic also sees DRAFT so changes can be tested before
 * they are published.
 */
export const servableStatuses = (environment: DataEnvironment): string[] =>
  environment === "sandbox" ? ["LIVE", "DRAFT"] : ["LIVE"];

/** Escapes user input for use inside a RegExp. */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
