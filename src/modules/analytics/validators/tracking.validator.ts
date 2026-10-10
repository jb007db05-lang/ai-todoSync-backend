const MAX_EVENT_BYTES = 32 * 1024;
const MAX_BATCH_BYTES = 256 * 1024;
const MAX_BATCH_SIZE = 100;
const MAX_EVENT_NAME_LENGTH = 255;
/** Real-time ingestion only accepts recent events (Mixpanel: 5 days). */
export const MAX_EVENT_AGE_MS = 5 * 24 * 60 * 60 * 1000;
/** Clock skew tolerated for events stamped in the future. */
export const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000;
/** Imports reject anything before this (Mixpanel: 1971-01-01). */
export const MIN_IMPORT_TIME_MS = Date.UTC(1971, 0, 1);

type JsonRecord = Record<string, unknown>;

export interface RawTrackingEvent {
  eventId?: string;
  eventName?: string;
  userId?: string;
  userIdentifier?: string;
  sessionId?: string;
  properties?: JsonRecord;
  payload?: JsonRecord;
  context?: JsonRecord;
  timestamp?: string | number | Date;
  type?: string;
  insertId?: string;
}

export interface NormalizedTrackingEvent {
  eventId: string;
  eventName: string;
  userIdentifier?: string;
  sessionId?: string;
  payload: JsonRecord;
}

export interface ValidationOptions {
  requireEventId: boolean;
}

export class TrackingValidationError extends Error {
  public status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, TrackingValidationError.prototype);
  }
}

const isPlainObject = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringifySize = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");

const ensureString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const validatePayloadSize = (value: unknown): void => {
  if (stringifySize(value) > MAX_EVENT_BYTES) {
    throw new TrackingValidationError("Payload too large");
  }
};

export const validateBatchBody = (value: unknown): RawTrackingEvent[] => {
  const bodySize = stringifySize(value);
  if (bodySize > MAX_BATCH_BYTES) {
    throw new TrackingValidationError("Batch payload too large");
  }

  if (
    isPlainObject(value) &&
    Array.isArray(value.events) &&
    (!("apiKey" in value) || typeof value.apiKey === "string")
  ) {
    if (value.events.length === 0) {
      throw new TrackingValidationError(
        "Batch must include at least one event",
      );
    }

    if (value.events.length > MAX_BATCH_SIZE) {
      throw new TrackingValidationError("Batch size limit exceeded");
    }

    return value.events as RawTrackingEvent[];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new TrackingValidationError(
        "Batch must include at least one event",
      );
    }

    if (value.length > MAX_BATCH_SIZE) {
      throw new TrackingValidationError("Batch size limit exceeded");
    }

    return value;
  }

  if (isPlainObject(value)) {
    return [value as RawTrackingEvent];
  }

  throw new TrackingValidationError(
    "Batch body must be an event or array of events",
  );
};

/** Parses an event timestamp; unparseable values are a client error, not a 500. */
const parseTimestamp = (
  value: RawTrackingEvent["timestamp"],
): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new TrackingValidationError("timestamp must be a valid date");
  }
  return date.toISOString();
};

const buildPayload = (event: RawTrackingEvent): JsonRecord => {
  const properties = isPlainObject(event.properties) ? event.properties : {};
  const payload = isPlainObject(event.payload) ? event.payload : {};
  const context = isPlainObject(event.context) ? event.context : {};
  const timestamp = parseTimestamp(event.timestamp);

  return {
    ...payload,
    properties,
    context,
    type: ensureString(event.type) ?? "track",
    ...(timestamp ? { timestamp } : {}),
  };
};

export const normalizeTrackingEvent = (
  event: RawTrackingEvent,
  options: ValidationOptions,
): NormalizedTrackingEvent => {
  if (!isPlainObject(event)) {
    throw new TrackingValidationError("Each event must be an object");
  }

  const eventName = ensureString(event.eventName);
  if (!eventName) {
    throw new TrackingValidationError("eventName is required");
  }
  if (eventName.length > MAX_EVENT_NAME_LENGTH) {
    throw new TrackingValidationError(
      `eventName must be at most ${MAX_EVENT_NAME_LENGTH} characters`,
    );
  }

  // Like Mixpanel's $insert_id: a client-chosen id makes retries idempotent.
  const properties = isPlainObject(event.properties) ? event.properties : {};
  const eventId =
    ensureString(event.eventId) ??
    ensureString(event.insertId) ??
    ensureString(properties.$insert_id);
  if (options.requireEventId && !eventId) {
    throw new TrackingValidationError("eventId is required");
  }

  const payload = buildPayload(event);
  validatePayloadSize(payload);

  return {
    eventId: eventId ?? "",
    eventName,
    userIdentifier:
      ensureString(event.userIdentifier) ?? ensureString(event.userId),
    sessionId: ensureString(event.sessionId),
    payload,
  };
};

export const trackingLimits = {
  maxBatchSize: MAX_BATCH_SIZE,
  maxEventBytes: MAX_EVENT_BYTES,
};
