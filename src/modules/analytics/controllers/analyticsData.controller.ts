import { Request, Response } from "express";
import AnalyticsKeyModel from "../models/analytics-key.model.js";
import AnalyticsEventRegistryModel from "../models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../models/analytics-log.model.js";
import AnalyticsUserModel from "../models/analytics-user.model.js";
import SdkIntegrationModel from "../../sdk-integrations/model.js";
import {
  environmentFilter,
  escapeRegex,
  parseEnvironment,
} from "../../../shared/environment.js";
import { AppError, isAppError } from "../../../utils/app-error.js";
import logger from "../../../lib/logger.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * createdAt filter for startDate/endDate query values. Date-only values cover
 * whole UTC days; anything unparseable is a 400 rather than a database error.
 */
const createdAtRange = (
  startDate: unknown,
  endDate: unknown,
): Record<string, Date> | undefined => {
  const parse = (value: unknown, edge: "start" | "end"): Date | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    const raw = String(value);
    const date = DATE_ONLY.test(raw)
      ? new Date(
          `${raw}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`,
        )
      : new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new AppError(
        400,
        `${edge === "start" ? "startDate" : "endDate"} must be a valid date`,
        "INVALID_DATE",
      );
    }
    return date;
  };
  const from = parse(startDate, "start");
  const to = parse(endDate, "end");
  if (!from && !to) return undefined;
  return { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
};

/** Event names for many registry ids in one query (instead of one per log). */
const eventNamesById = async (ids: string[]): Promise<Map<string, string>> => {
  const unique = [...new Set(ids)].filter((id) => /^[a-f0-9]{24}$/i.test(id));
  if (unique.length === 0) return new Map();
  const rows = await AnalyticsEventRegistryModel.find({ _id: { $in: unique } })
    .select({ eventName: 1 })
    .lean()
    .exec();
  return new Map(rows.map((row) => [row._id.toString(), row.eventName]));
};

class AnalyticsDataController {
  private parsePagination(req: Request) {
    const page = Math.max(
      1,
      parseInt((req.query.page as string) || "1", 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) || "30", 10) || 30),
    );

    return {
      page,
      limit,
      skip: (page - 1) * limit,
    };
  }

  private parseEventNames(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .flatMap((item) => this.parseEventNames(item))
        .filter((item, index, items) => items.indexOf(item) === index);
    }

    if (typeof value !== "string") {
      return [];
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private buildEventRefQuery(apiKeyId: string, eventRef: string) {
    return {
      apiKeyId,
      $or: [
        { eventRef },
        {
          eventRef: { $exists: false },
          eventId: eventRef,
        },
      ],
    };
  }

  private resolveEventRef(log: { eventRef?: string; eventId: string }) {
    return log.eventRef || log.eventId;
  }

  /**
   * Helper to verify if the requesting user owns the API key ID.
   */
  private verifyKeyOwnership = async (req: Request, apiKeyId: string) => {
    const userId = req.user?._id?.toString();
    const key = await AnalyticsKeyModel.findOne({ _id: apiKeyId, userId })
      .lean()
      .exec();
    return !!key;
  };

  /**
   * GET /api/events?apiKeyId=
   */
  public getEvents = async (req: Request, res: Response) => {
    try {
      const { apiKeyId, sdkIntegrationId, eventName, startDate, endDate } =
        req.query;
      const range = createdAtRange(startDate, endDate);

      const tenantId = req.user?._id?.toString();
      let query: Record<string, unknown> = {};

      if (sdkIntegrationId) {
        const integration = await SdkIntegrationModel.findOne({
          _id: sdkIntegrationId,
          tenantId,
        })
          .lean()
          .exec();
        if (!integration) {
          return res.status(403).json({ error: "Unauthorized access" });
        }
        query = { sdkIntegrationId };
      } else {
        if (!apiKeyId)
          return res.status(400).json({ error: "apiKeyId is required" });
        if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
          return res
            .status(403)
            .json({ error: "Unauthorized access to this API key's data" });
        }
        query = { apiKeyId };
      }
      // Integration data is split into live and sandbox.
      const envFilter = sdkIntegrationId
        ? environmentFilter(parseEnvironment(req.query.environment))
        : {};

      const eventNames = this.parseEventNames(req.query.eventNames);
      if (eventNames.length > 0) {
        query.eventName = { $in: eventNames };
      } else if (eventName) {
        query.eventName = new RegExp(escapeRegex(String(eventName)), "i");
      }

      const events = await AnalyticsEventRegistryModel.find(query)
        .lean()
        .exec();

      // Enrich with counts
      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const logQuery: Record<string, unknown> = sdkIntegrationId
            ? { sdkIntegrationId, eventRef: event._id.toString(), ...envFilter }
            : this.buildEventRefQuery(apiKeyId as string, event._id.toString());
          if (range) logQuery.createdAt = range;
          const count = await AnalyticsLogModel.countDocuments(logQuery);
          return {
            id: event._id,
            eventName: event.eventName,
            count,
            createdAt: event.createdAt,
          };
        }),
      );

      // Event names are shared across environments; show those seen in this one.
      res
        .status(200)
        .json(
          sdkIntegrationId
            ? enrichedEvents.filter((e) => e.count > 0)
            : enrichedEvents,
        );
    } catch (error) {
      if (isAppError(error)) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error(
        "Get events error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch events" });
    }
  };

  /**
   * GET /api/events/:eventId/logs
   */
  public getEventLogs = async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { apiKeyId, sdkIntegrationId } = req.query;

      const tenantId = req.user?._id?.toString();
      let query: Record<string, unknown> = {};

      if (sdkIntegrationId) {
        const integration = await SdkIntegrationModel.findOne({
          _id: sdkIntegrationId,
          tenantId,
        })
          .lean()
          .exec();
        if (!integration) {
          return res.status(403).json({ error: "Unauthorized access" });
        }
        query = {
          sdkIntegrationId,
          eventRef: eventId,
          ...environmentFilter(parseEnvironment(req.query.environment)),
        };
      } else {
        if (!apiKeyId)
          return res.status(400).json({ error: "apiKeyId is required" });
        if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
          return res.status(403).json({ error: "Unauthorized access" });
        }
        query = this.buildEventRefQuery(apiKeyId as string, eventId as string);
      }

      const logs = await AnalyticsLogModel.find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec();

      res.status(200).json(logs);
    } catch (error) {
      logger.error(
        "Get logs error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  };

  /**
   * GET /api/users?apiKeyId=
   */
  public getUsers = async (req: Request, res: Response) => {
    try {
      const { apiKeyId } = req.query;

      if (!apiKeyId)
        return res.status(400).json({ error: "apiKeyId is required" });
      if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const users = await AnalyticsUserModel.find({ apiKeyId })
        .sort({
          createdAt: -1,
        })
        .lean()
        .exec();
      res.status(200).json(users);
    } catch (error) {
      logger.error(
        "Get users error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch users" });
    }
  };

  /**
   * GET /api/users/:identifier/events
   */
  public getUserEvents = async (req: Request, res: Response) => {
    try {
      const { identifier } = req.params;
      const { apiKeyId } = req.query;

      if (!apiKeyId)
        return res.status(400).json({ error: "apiKeyId is required" });
      if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const logs = await AnalyticsLogModel.find({
        userIdentifier: identifier,
        apiKeyId,
      })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      // Enrich logs with event names
      const names = await eventNamesById(
        logs.map((log) => this.resolveEventRef(log)),
      );
      const enrichedLogs = await Promise.all(
        logs.map(async (log) => {
          const event = { eventName: names.get(this.resolveEventRef(log)) };
          return {
            ...log,
            eventId: this.resolveEventRef(log),
            eventName: event?.eventName || "Unknown",
          };
        }),
      );

      res.status(200).json(enrichedLogs);
    } catch (error) {
      logger.error(
        "Get user events error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch user events" });
    }
  };

  /**
   * GET /api/analytics/all-logs?apiKeyId=&limit=&offset=
   */
  public getAllLogs = async (req: Request, res: Response) => {
    try {
      const {
        apiKeyId,
        sdkIntegrationId,
        eventName,
        startDate,
        endDate,
        offset = "0",
      } = req.query;

      const tenantId = req.user?._id?.toString();
      let query: Record<string, unknown> = {};

      if (sdkIntegrationId) {
        const integration = await SdkIntegrationModel.findOne({
          _id: sdkIntegrationId,
          tenantId,
        })
          .lean()
          .exec();
        if (!integration) {
          return res.status(403).json({ error: "Unauthorized access" });
        }
        query = {
          sdkIntegrationId,
          ...environmentFilter(parseEnvironment(req.query.environment)),
        };
      } else {
        if (!apiKeyId)
          return res.status(400).json({ error: "apiKeyId is required" });
        if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
          return res.status(403).json({ error: "Unauthorized access" });
        }
        query = { apiKeyId };
      }

      const { page, limit, skip } = this.parsePagination(req);
      const legacyOffset = parseInt(offset as string, 10);
      const effectiveSkip =
        Number.isFinite(legacyOffset) && legacyOffset > 0 ? legacyOffset : skip;

      const eventNames = this.parseEventNames(req.query.eventNames);
      const registryFilter = sdkIntegrationId
        ? { sdkIntegrationId }
        : { apiKeyId };

      if (eventNames.length > 0) {
        const matchingEvents = await AnalyticsEventRegistryModel.find({
          ...registryFilter,
          eventName: { $in: eventNames },
        })
          .select({ _id: 1 })
          .lean()
          .exec();

        const eventRefs = matchingEvents.map((event) => event._id.toString());
        query.$or = [
          { eventRef: { $in: eventRefs } },
          { eventRef: { $exists: false }, eventId: { $in: eventRefs } },
        ];
      } else if (eventName) {
        const matchingEvents = await AnalyticsEventRegistryModel.find({
          ...registryFilter,
          eventName: new RegExp(escapeRegex(String(eventName)), "i"),
        })
          .select({ _id: 1 })
          .lean()
          .exec();

        const eventRefs = matchingEvents.map((event) => event._id.toString());
        query.$or = [
          { eventRef: { $in: eventRefs } },
          { eventRef: { $exists: false }, eventId: { $in: eventRefs } },
        ];
      }

      const range = createdAtRange(startDate, endDate);
      if (range) query.createdAt = range;

      // Fetch logs
      const logs = await AnalyticsLogModel.find(query)
        .sort({ createdAt: -1 })
        .skip(effectiveSkip)
        .limit(limit)
        .lean()
        .exec();

      const total = await AnalyticsLogModel.countDocuments(query);

      // Enrich logs with event names from registry
      const names = await eventNamesById(
        logs.map((log) => this.resolveEventRef(log)),
      );
      const enrichedLogs = await Promise.all(
        logs.map(async (log) => {
          const event = { eventName: names.get(this.resolveEventRef(log)) };
          return {
            _id: log._id,
            userId: log.userIdentifier || "-",
            eventName: event?.eventName || "Unknown",
            timestamp: log.createdAt,
            payload: log.payload,
            eventId: this.resolveEventRef(log),
            sessionId: log.sessionId,
            context:
              log.payload &&
              typeof log.payload === "object" &&
              "context" in log.payload
                ? (log.payload.context as Record<string, unknown>)
                : {},
          };
        }),
      );

      res.status(200).json({
        data: {
          events: enrichedLogs,
          total,
          page,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      logger.error(
        "Get all logs error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch raw logs" });
    }
  };
  /**
   * GET /api/sdk-integrations/:sdkIntegrationId/events
   * Integration-scoped event registry listing
   */
  public getScopedEvents = async (req: Request, res: Response) => {
    try {
      const sdkIntegrationId =
        req.sdkIntegration?._id?.toString() ?? req.params.sdkIntegrationId;
      const { eventName, startDate, endDate } = req.query;
      const environment = parseEnvironment(req.query.environment);
      const range = createdAtRange(startDate, endDate);

      const query: Record<string, unknown> = { sdkIntegrationId };
      const eventNames = this.parseEventNames(req.query.eventNames);
      if (eventNames.length > 0) {
        query.eventName = { $in: eventNames };
      } else if (eventName) {
        query.eventName = new RegExp(escapeRegex(String(eventName)), "i");
      }

      const events = await AnalyticsEventRegistryModel.find(query)
        .lean()
        .exec();

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const logQuery: Record<string, unknown> = {
            sdkIntegrationId,
            ...environmentFilter(environment),
            $or: [
              { eventRef: event._id.toString() },
              { eventRef: { $exists: false }, eventId: event._id.toString() },
            ],
          };
          if (range) logQuery.createdAt = range;
          const count = await AnalyticsLogModel.countDocuments(logQuery);
          return {
            id: event._id,
            eventName: event.eventName,
            count,
            createdAt: event.createdAt,
          };
        }),
      );

      // Event names are shared across environments; list only those seen here.
      res.status(200).json(enrichedEvents.filter((e) => e.count > 0));
    } catch (error) {
      if (isAppError(error)) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error(
        "Scoped get events error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch events" });
    }
  };

  /**
   * GET /api/sdk-integrations/:sdkIntegrationId/events/:eventId/logs
   */
  public getScopedEventLogs = async (req: Request, res: Response) => {
    try {
      const sdkIntegrationId =
        req.sdkIntegration?._id?.toString() ?? req.params.sdkIntegrationId;
      const { eventId } = req.params;

      const logs = await AnalyticsLogModel.find({
        sdkIntegrationId,
        ...environmentFilter(parseEnvironment(req.query.environment)),
        $or: [{ eventRef: eventId }, { eventRef: { $exists: false }, eventId }],
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec();

      res.status(200).json(logs);
    } catch (error) {
      if (isAppError(error)) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error(
        "Scoped get logs error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  };

  /**
   * GET /api/sdk-integrations/:sdkIntegrationId/all-logs
   */
  public getScopedAllLogs = async (req: Request, res: Response) => {
    try {
      const sdkIntegrationId =
        req.sdkIntegration?._id?.toString() ?? req.params.sdkIntegrationId;
      const { eventName, startDate, endDate, offset = "0" } = req.query;

      const query: Record<string, unknown> = {
        sdkIntegrationId,
        ...environmentFilter(parseEnvironment(req.query.environment)),
      };
      const { page, limit, skip } = this.parsePagination(req);
      const legacyOffset = parseInt(offset as string, 10);
      const effectiveSkip =
        Number.isFinite(legacyOffset) && legacyOffset > 0 ? legacyOffset : skip;

      const eventNames = this.parseEventNames(req.query.eventNames);
      if (eventNames.length > 0) {
        const matchingEvents = await AnalyticsEventRegistryModel.find({
          sdkIntegrationId,
          eventName: { $in: eventNames },
        })
          .select({ _id: 1 })
          .lean()
          .exec();
        const eventRefs = matchingEvents.map((e) => e._id.toString());
        query.$or = [
          { eventRef: { $in: eventRefs } },
          { eventRef: { $exists: false }, eventId: { $in: eventRefs } },
        ];
      } else if (eventName) {
        const matchingEvents = await AnalyticsEventRegistryModel.find({
          sdkIntegrationId,
          eventName: new RegExp(escapeRegex(String(eventName)), "i"),
        })
          .select({ _id: 1 })
          .lean()
          .exec();
        const eventRefs = matchingEvents.map((e) => e._id.toString());
        query.$or = [
          { eventRef: { $in: eventRefs } },
          { eventRef: { $exists: false }, eventId: { $in: eventRefs } },
        ];
      }

      const range = createdAtRange(startDate, endDate);
      if (range) query.createdAt = range;

      const logs = await AnalyticsLogModel.find(query)
        .sort({ createdAt: -1 })
        .skip(effectiveSkip)
        .limit(limit)
        .lean()
        .exec();

      const total = await AnalyticsLogModel.countDocuments(query);

      const names = await eventNamesById(
        logs.map((log) => this.resolveEventRef(log)),
      );
      const enrichedLogs = await Promise.all(
        logs.map(async (log) => {
          const event = { eventName: names.get(this.resolveEventRef(log)) };
          return {
            _id: log._id,
            userId: log.userIdentifier || "-",
            eventName: event?.eventName || "Unknown",
            timestamp: log.createdAt,
            payload: log.payload,
            eventId: this.resolveEventRef(log),
            sessionId: log.sessionId,
            context:
              log.payload &&
              typeof log.payload === "object" &&
              "context" in log.payload
                ? (log.payload.context as Record<string, unknown>)
                : {},
          };
        }),
      );

      res.status(200).json({
        data: {
          events: enrichedLogs,
          total,
          page,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      if (isAppError(error)) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error(
        "Scoped get all logs error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch raw logs" });
    }
  };

  /**
   * GET /api/sdk-integrations/:sdkIntegrationId/users
   */
  public getScopedUsers = async (req: Request, res: Response) => {
    try {
      const sdkIntegrationId =
        req.sdkIntegration?._id?.toString() ?? req.params.sdkIntegrationId;

      // Fetch unique user identifiers from logs scoped to this integration
      const userIdentifiers = await AnalyticsLogModel.distinct(
        "userIdentifier",
        {
          sdkIntegrationId,
          ...environmentFilter(parseEnvironment(req.query.environment)),
          userIdentifier: { $exists: true, $ne: null },
        },
      ).exec();

      res
        .status(200)
        .json(userIdentifiers.map((id: string) => ({ userIdentifier: id })));
    } catch (error) {
      if (isAppError(error)) {
        return res.status(error.status).json({ error: error.message });
      }
      logger.error(
        "Scoped get users error",
        error instanceof Error ? error : undefined,
      );
      res.status(500).json({ error: "Failed to fetch users" });
    }
  };
}

export default new AnalyticsDataController();
