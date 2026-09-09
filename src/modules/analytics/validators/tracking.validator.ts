const MAX_EVENT_BYTES = 32 * 1024;
const MAX_BATCH_BYTES = 256 * 1024;
const MAX_BATCH_SIZE = 100;

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

const buildPayload = (event: RawTrackingEvent): JsonRecord => {
  const properties = isPlainObject(event.properties) ? event.properties : {};
  const payload = isPlainObject(event.payload) ? event.payload : {};
  const context = isPlainObject(event.context) ? event.context : {};
  const timestamp =
    typeof event.timestamp === "string" || typeof event.timestamp === "number"
      ? new Date(event.timestamp).toISOString()
      : event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : undefined;

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

  const eventId = ensureString(event.eventId);
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
