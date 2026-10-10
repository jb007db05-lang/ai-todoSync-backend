import mongoose from "mongoose";
import AnalyticsEventRegistryModel from "../analytics/models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../analytics/models/analytics-log.model.js";
import AnalyticsUserModel from "../analytics/models/analytics-user.model.js";
import { AppError } from "../../utils/app-error.js";
import {
  environmentFilter,
  escapeRegex,
  scopedApiKeyId,
  type DataEnvironment,
} from "../../shared/environment.js";
import { ENGAGEMENT_EVENT_NAMES } from "../engagement/types.js";

/**
 * The Events page (Mixpanel: Data → Events) and the Lexicon (event
 * dictionary) for one SDK integration and environment.
 */

type JsonRecord = Record<string, unknown>;

export interface StreamFilters {
  eventNames?: string[];
  q?: string;
  distinctId?: string;
  userId?: string;
  deviceId?: string;
  propertyKey?: string;
  propertyValue?: string;
  startDate?: string;
  endDate?: string;
}

export interface StreamEvent {
  id: string;
  eventName: string;
  time: string;
  receivedAt: string;
  distinctId: string | null;
  userId: string | null;
  deviceId: string | null;
  sessionId: string | null;
  insertId: string;
  imported: boolean;
  properties: JsonRecord;
  defaultProperties: JsonRecord;
  raw: JsonRecord;
}

interface StoredLog {
  _id: mongoose.Types.ObjectId;
  eventId: string;
  eventRef?: string;
  eventName?: string;
  userIdentifier?: string;
  sessionId?: string;
  payload?: JsonRecord;
  createdAt: Date;
}

export const MAX_PAGE_SIZE = 100;
export const MAX_EXPORT_ROWS = 10_000;
const PROPERTY_KEY_SAMPLE = 1000;
const MAX_SEARCH_LENGTH = 200;
const DAY_MS = 86_400_000;

/** Payload keys that are envelope, not event properties. */
const ENVELOPE_KEYS = new Set([
  "properties",
  "context",
  "type",
  "timestamp",
  "$import",
]);

/** Event names produced by the SDK or the engagement runtime itself. */
const AUTO_TRACKED = new Set<string>([
  "page",
  "identify",
  "exit_intent",
  "idle_timeout",
  ...ENGAGEMENT_EVENT_NAMES,
]);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" or an ISO timestamp; date-only bounds cover the whole UTC day. */
const parseBound = (value: string, edge: "start" | "end"): Date => {
  const date = DATE_ONLY.test(value)
    ? new Date(
        `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`,
      )
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(
      400,
      `${edge === "start" ? "startDate" : "endDate"} must be a date (YYYY-MM-DD)`,
      "INVALID_DATE",
    );
  }
  return date;
};

/** Property keys usable as Mongo paths: no dots, no leading `$`. */
const SAFE_PROPERTY_KEY = /^[^.$][^.]{0,199}$/;

export const encodeCursor = (log: { createdAt: Date; _id: unknown }): string =>
  Buffer.from(`${log.createdAt.getTime()}:${String(log._id)}`).toString(
    "base64url",
  );

export const decodeCursor = (
  cursor: string,
): { createdAt: Date; id: mongoose.Types.ObjectId } => {
  const [ms, id] = Buffer.from(cursor, "base64url").toString("utf8").split(":");
  const time = Number(ms);
  if (!Number.isFinite(time) || !id || !/^[a-f0-9]{24}$/i.test(id)) {
    throw new AppError(400, "Invalid cursor", "INVALID_CURSOR");
  }
  return { createdAt: new Date(time), id: new mongoose.Types.ObjectId(id) };
};

/** Splits a stored log into Mixpanel-style "your" and "default" properties. */
export const toStreamEvent = (
  log: StoredLog,
  eventName: string,
): StreamEvent => {
  const payload = isRecord(log.payload) ? log.payload : {};
  const nested = isRecord(payload.properties) ? payload.properties : {};
  const context = isRecord(payload.context) ? payload.context : {};

  const properties: JsonRecord = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ENVELOPE_KEYS.has(key) && value !== undefined) properties[key] = value;
  }
  Object.assign(properties, nested);

  const page = isRecord(context.page) ? context.page : {};
  const library = isRecord(context.library) ? context.library : {};
  const screen = isRecord(context.screen) ? context.screen : {};
  const deviceId =
    asString(context.deviceId) ?? asString(nested.$device_id) ?? null;

  const receivedAt = new Date(log.createdAt);
  const sentAt =
    typeof payload.timestamp === "string" ? new Date(payload.timestamp) : null;
  const time = sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : receivedAt;

  const defaultProperties: JsonRecord = {};
  const setDefault = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") {
      defaultProperties[key] = value;
    }
  };
  setDefault("$current_url", page.url);
  setDefault("$title", page.title);
  setDefault("$referrer", page.referrer);
  setDefault("$lib", library.name);
  setDefault("$lib_version", library.version);
  setDefault("$screen_width", screen.width);
  setDefault("$screen_height", screen.height);
  setDefault("$locale", context.locale);
  setDefault("$device_id", deviceId);
  setDefault("$session_id", log.sessionId);
  setDefault("$event_type", payload.type);
  for (const [key, value] of Object.entries(context)) {
    if (!["page", "library", "screen", "locale", "deviceId"].includes(key)) {
      setDefault(`$${key}`, value);
    }
  }
  defaultProperties.mp_processing_time_ms = Math.max(
    0,
    receivedAt.getTime() - time.getTime(),
  );

  const userId = asString(log.userIdentifier);
  return {
    id: String(log._id),
    eventName,
    time: time.toISOString(),
    receivedAt: receivedAt.toISOString(),
    distinctId: userId ?? deviceId,
    userId,
    deviceId,
    sessionId: asString(log.sessionId),
    insertId: log.eventId,
    imported: payload.$import === true,
    properties,
    defaultProperties,
    raw: {
      event: eventName,
      eventId: log.eventId,
      ...(userId ? { userId } : {}),
      ...(log.sessionId ? { sessionId: log.sessionId } : {}),
      ...payload,
      receivedAt: receivedAt.toISOString(),
    },
  };
};

const csvCell = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet formula injection guard.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

class EventsService {
  /** Mongo filter for the stream; shared by paging, live polling and export. */
  public async buildFilter(
    sdkIntegrationId: string,
    environment: DataEnvironment,
    filters: StreamFilters,
  ): Promise<JsonRecord> {
    const and: JsonRecord[] = [
      { sdkIntegrationId },
      environmentFilter(environment),
    ];

    if (filters.eventNames?.length) {
      const refs = await AnalyticsEventRegistryModel.find({
        sdkIntegrationId,
        eventName: { $in: filters.eventNames },
      })
        .select({ _id: 1 })
        .lean()
        .exec();
      and.push({ eventRef: { $in: refs.map((r) => r._id.toString()) } });
    }

    if (filters.userId) and.push({ userIdentifier: filters.userId });
    if (filters.deviceId) {
      and.push({ "payload.context.deviceId": filters.deviceId });
    }
    if (filters.distinctId) {
      and.push({
        $or: [
          { userIdentifier: filters.distinctId },
          {
            userIdentifier: { $in: [null, ""] },
            "payload.context.deviceId": filters.distinctId,
          },
        ],
      });
    }

    if (filters.propertyKey) {
      if (!SAFE_PROPERTY_KEY.test(filters.propertyKey)) {
        throw new AppError(
          400,
          "That property cannot be filtered on",
          "INVALID_PROPERTY",
        );
      }
      const paths = [
        `payload.${filters.propertyKey}`,
        `payload.properties.${filters.propertyKey}`,
      ];
      const value = filters.propertyValue ?? "";
      if (value === "") {
        and.push({ $or: paths.map((p) => ({ [p]: { $exists: true } })) });
      } else {
        // Values arrive as text; also match their number/boolean forms.
        const candidates: unknown[] = [value];
        const num = Number(value);
        if (value.trim() !== "" && Number.isFinite(num)) candidates.push(num);
        if (value === "true" || value === "false") {
          candidates.push(value === "true");
        }
        and.push({ $or: paths.map((p) => ({ [p]: { $in: candidates } })) });
      }
    }

    if (filters.startDate || filters.endDate) {
      const createdAt: JsonRecord = {};
      if (filters.startDate)
        createdAt.$gte = parseBound(filters.startDate, "start");
      if (filters.endDate) createdAt.$lte = parseBound(filters.endDate, "end");
      and.push({ createdAt });
    }

    const q = filters.q?.trim();
    if (q) {
      if (q.length > MAX_SEARCH_LENGTH) {
        throw new AppError(
          400,
          `Search must be at most ${MAX_SEARCH_LENGTH} characters`,
          "INVALID_SEARCH",
        );
      }
      const pattern = escapeRegex(q);
      const regex = new RegExp(pattern, "i");
      const namedRefs = await AnalyticsEventRegistryModel.find({
        sdkIntegrationId,
        $or: [{ eventName: regex }, { displayName: regex }],
      })
        .select({ _id: 1 })
        .lean()
        .exec();
      // "Any property value": scan the values of the event's own properties.
      const valueMatches = (path: string) => ({
        $anyElementTrue: [
          {
            $map: {
              input: { $objectToArray: { $ifNull: [path, {}] } },
              as: "kv",
              in: {
                $regexMatch: {
                  input: {
                    $convert: {
                      input: "$$kv.v",
                      to: "string",
                      onError: "",
                      onNull: "",
                    },
                  },
                  regex: pattern,
                  options: "i",
                },
              },
            },
          },
        ],
      });
      and.push({
        $or: [
          { userIdentifier: regex },
          { sessionId: regex },
          { eventId: regex },
          { "payload.context.deviceId": regex },
          { eventRef: { $in: namedRefs.map((r) => r._id.toString()) } },
          { $expr: valueMatches("$payload.properties") },
          { $expr: valueMatches("$payload") },
        ],
      });
    }

    return { $and: and };
  }

  /** Newest-first page; `before` pages back, `since` polls for new events. */
  public async stream(
    sdkIntegrationId: string,
    environment: DataEnvironment,
    filters: StreamFilters,
    options: { before?: string; since?: string; limit?: number },
  ) {
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(options.limit ?? 50)),
    );
    const filter = await this.buildFilter(
      sdkIntegrationId,
      environment,
      filters,
    );
    const and = filter.$and as JsonRecord[];

    if (options.before) {
      const cursor = decodeCursor(options.before);
      and.push({
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
        ],
      });
    }
    if (options.since) {
      and.push({ createdAt: { $gte: parseBound(options.since, "start") } });
    }

    const logs = (await AnalyticsLogModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec()) as unknown as StoredLog[];

    const hasMore = logs.length > limit;
    const page = logs.slice(0, limit);
    const events = await this.toStreamEvents(sdkIntegrationId, page);
    const last = page[page.length - 1];

    return {
      events,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      serverTime: new Date().toISOString(),
    };
  }

  /** CSV of the filtered stream, newest first, at most MAX_EXPORT_ROWS rows. */
  public async exportCsv(
    sdkIntegrationId: string,
    environment: DataEnvironment,
    filters: StreamFilters,
    options: { columns: string[]; allProperties: boolean },
  ): Promise<{ csv: string; rows: number }> {
    const filter = await this.buildFilter(
      sdkIntegrationId,
      environment,
      filters,
    );
    const logs = (await AnalyticsLogModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(MAX_EXPORT_ROWS)
      .lean()
      .exec()) as unknown as StoredLog[];
    const events = await this.toStreamEvents(sdkIntegrationId, logs);

    let propertyColumns = options.columns;
    if (options.allProperties) {
      const keys = new Set<string>();
      for (const event of events) {
        Object.keys(event.properties).forEach((k) => keys.add(k));
        Object.keys(event.defaultProperties).forEach((k) => keys.add(k));
      }
      propertyColumns = [...keys].sort();
    }

    const base = [
      "time",
      "received_at",
      "event",
      "distinct_id",
      "user_id",
      "device_id",
      "session_id",
      "insert_id",
    ];
    const lines = [[...base, ...propertyColumns].map(csvCell).join(",")];
    for (const event of events) {
      const value = (key: string) =>
        key in event.properties
          ? event.properties[key]
          : event.defaultProperties[key];
      lines.push(
        [
          event.time,
          event.receivedAt,
          event.eventName,
          event.distinctId,
          event.userId,
          event.deviceId,
          event.sessionId,
          event.insertId,
          ...propertyColumns.map(value),
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return { csv: `${lines.join("\r\n")}\r\n`, rows: events.length };
  }

  /** Property names seen on recent events, for column pickers and filters. */
  public async propertyKeys(
    sdkIntegrationId: string,
    environment: DataEnvironment,
  ) {
    const logs = (await AnalyticsLogModel.find({
      sdkIntegrationId,
      ...environmentFilter(environment),
    })
      .sort({ createdAt: -1 })
      .limit(PROPERTY_KEY_SAMPLE)
      .lean()
      .exec()) as unknown as StoredLog[];

    const eventProperties = new Set<string>();
    const defaultProperties = new Set<string>();
    for (const log of logs) {
      const event = toStreamEvent(log, "");
      Object.keys(event.properties).forEach((k) => eventProperties.add(k));
      Object.keys(event.defaultProperties).forEach((k) =>
        defaultProperties.add(k),
      );
    }
    return {
      eventProperties: [...eventProperties].sort(),
      defaultProperties: [...defaultProperties].sort(),
    };
  }

  /** Activity summary and profile traits for one distinct id. */
  public async userProfile(
    sdkIntegrationId: string,
    environment: DataEnvironment,
    distinctId: string,
  ) {
    const match = {
      sdkIntegrationId,
      ...environmentFilter(environment),
      $or: [
        { userIdentifier: distinctId },
        {
          userIdentifier: { $in: [null, ""] },
          "payload.context.deviceId": distinctId,
        },
      ],
    };

    const [summary] = await AnalyticsLogModel.aggregate<{
      eventCount: number;
      firstSeen: Date;
      lastSeen: Date;
      identifiedEvents: number;
      deviceIds: Array<string | null>;
    }>([
      { $match: match },
      {
        $group: {
          _id: null,
          eventCount: { $sum: 1 },
          firstSeen: { $min: "$createdAt" },
          lastSeen: { $max: "$createdAt" },
          identifiedEvents: {
            $sum: { $cond: [{ $eq: ["$userIdentifier", distinctId] }, 1, 0] },
          },
          deviceIds: { $addToSet: "$payload.context.deviceId" },
        },
      },
    ]).exec();

    const profile = await AnalyticsUserModel.findOne({
      apiKeyId: scopedApiKeyId(sdkIntegrationId, environment),
      userIdentifier: distinctId,
    })
      .lean()
      .exec();

    if (!summary && !profile) {
      throw new AppError(404, "No activity for this user", "NOT_FOUND");
    }

    const top = await AnalyticsLogModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: match },
      { $group: { _id: "$eventRef", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]).exec();
    const names = await this.eventNamesByRef(
      sdkIntegrationId,
      top.map((t) => t._id),
    );

    const now = new Date();
    return {
      distinctId,
      identified: Boolean(profile) || (summary?.identifiedEvents ?? 0) > 0,
      traits: isRecord(profile?.metadata) ? profile.metadata : {},
      eventCount: summary?.eventCount ?? 0,
      firstSeen: (
        summary?.firstSeen ??
        profile?.createdAt ??
        now
      ).toISOString(),
      lastSeen: (summary?.lastSeen ?? profile?.createdAt ?? now).toISOString(),
      deviceIds: (summary?.deviceIds ?? [])
        .filter((d): d is string => typeof d === "string" && d.length > 0)
        .slice(0, 20),
      topEvents: top.map((t) => ({
        eventName: names.get(t._id) ?? "Unknown",
        count: t.count,
      })),
    };
  }

  /** The event dictionary with volumes for this environment. */
  public async lexicon(sdkIntegrationId: string, environment: DataEnvironment) {
    const since30d = new Date(Date.now() - 30 * DAY_MS);
    const [registry, volumes] = await Promise.all([
      AnalyticsEventRegistryModel.find({ sdkIntegrationId }).lean().exec(),
      AnalyticsLogModel.aggregate<{
        _id: string;
        total: number;
        last30: number;
        firstSeen: Date;
        lastSeen: Date;
      }>([
        { $match: { sdkIntegrationId, ...environmentFilter(environment) } },
        {
          $group: {
            _id: "$eventRef",
            total: { $sum: 1 },
            last30: {
              $sum: { $cond: [{ $gte: ["$createdAt", since30d] }, 1, 0] },
            },
            firstSeen: { $min: "$createdAt" },
            lastSeen: { $max: "$createdAt" },
          },
        },
      ]).exec(),
    ]);
    const volumeByRef = new Map(volumes.map((v) => [v._id, v]));

    return (
      registry
        // Event names are shared across environments; list those seen here.
        .filter((event) => volumeByRef.has(event._id.toString()))
        .map((event) => {
          const volume = volumeByRef.get(event._id.toString())!;
          return {
            id: event._id.toString(),
            eventName: event.eventName,
            displayName: event.displayName ?? "",
            description: event.description ?? "",
            hidden: event.hidden === true,
            tags: event.tags ?? [],
            volume30d: volume.last30,
            totalVolume: volume.total,
            firstSeen: volume.firstSeen.toISOString(),
            lastSeen: volume.lastSeen.toISOString(),
            autoTracked:
              AUTO_TRACKED.has(event.eventName) ||
              event.eventName.startsWith("$"),
          };
        })
        .sort(
          (a, b) =>
            b.volume30d - a.volume30d || a.eventName.localeCompare(b.eventName),
        )
    );
  }

  public async updateLexiconEvent(
    sdkIntegrationId: string,
    eventId: string,
    patch: {
      displayName?: string;
      description?: string;
      hidden?: boolean;
      tags?: string[];
    },
  ) {
    if (!/^[a-f0-9]{24}$/i.test(eventId)) {
      throw new AppError(404, "Event not found", "NOT_FOUND");
    }
    const updated = await AnalyticsEventRegistryModel.findOneAndUpdate(
      { _id: eventId, sdkIntegrationId },
      { $set: patch },
      { new: true },
    )
      .lean()
      .exec();
    if (!updated) {
      throw new AppError(404, "Event not found", "NOT_FOUND");
    }
    return {
      id: updated._id.toString(),
      eventName: updated.eventName,
      displayName: updated.displayName ?? "",
      description: updated.description ?? "",
      hidden: updated.hidden === true,
      tags: updated.tags ?? [],
    };
  }

  private async toStreamEvents(
    sdkIntegrationId: string,
    logs: StoredLog[],
  ): Promise<StreamEvent[]> {
    const missing = logs
      .filter((log) => !log.eventName && log.eventRef)
      .map((log) => log.eventRef as string);
    const names = await this.eventNamesByRef(sdkIntegrationId, missing);
    return logs.map((log) =>
      toStreamEvent(
        log,
        log.eventName ?? names.get(log.eventRef ?? "") ?? "Unknown",
      ),
    );
  }

  private async eventNamesByRef(
    sdkIntegrationId: string,
    refs: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(refs)].filter((r) => /^[a-f0-9]{24}$/i.test(r));
    if (ids.length === 0) return new Map();
    const rows = await AnalyticsEventRegistryModel.find({
      _id: { $in: ids },
      sdkIntegrationId,
    })
      .select({ eventName: 1 })
      .lean()
      .exec();
    return new Map(rows.map((r) => [r._id.toString(), r.eventName]));
  }
}

export default new EventsService();
