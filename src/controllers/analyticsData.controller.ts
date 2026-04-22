import { Request, Response } from "express";
import AnalyticsKeyModel from "../models/analytics-key.model.js";
import AnalyticsEventRegistryModel from "../models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../models/analytics-log.model.js";
import AnalyticsUserModel from "../models/analytics-user.model.js";
import logger from "../lib/logger.js";

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
      const { apiKeyId, eventName, startDate, endDate } = req.query;

      if (!apiKeyId)
        return res.status(400).json({ error: "apiKeyId is required" });
      if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
        return res
          .status(403)
          .json({ error: "Unauthorized access to this API key's data" });
      }

      const query: Record<string, unknown> = { apiKeyId };
      const eventNames = this.parseEventNames(req.query.eventNames);
      if (eventNames.length > 0) {
        query.eventName = { $in: eventNames };
      } else if (eventName) {
        query.eventName = new RegExp(eventName as string, "i");
      }

      const events = await AnalyticsEventRegistryModel.find(query)
        .lean()
        .exec();

      // Enrich with counts
      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const logQuery: Record<string, unknown> = this.buildEventRefQuery(
            apiKeyId as string,
            event._id.toString(),
          );
          if (startDate || endDate) {
            logQuery.createdAt = {};
            if (startDate)
              (logQuery.createdAt as Record<string, Date>).$gte = new Date(
                startDate as string,
              );
            if (endDate)
              (logQuery.createdAt as Record<string, Date>).$lte = new Date(
                endDate as string,
              );
          }
          const count = await AnalyticsLogModel.countDocuments(logQuery);
          return {
            id: event._id,
            eventName: event.eventName,
            count,
            createdAt: event.createdAt,
          };
        }),
      );

      res.status(200).json(enrichedEvents);
    } catch (error) {
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
      const { apiKeyId } = req.query;

      if (!apiKeyId)
        return res.status(400).json({ error: "apiKeyId is required" });
      if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const logs = await AnalyticsLogModel.find(
        this.buildEventRefQuery(apiKeyId as string, eventId as string),
      )
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
      const enrichedLogs = await Promise.all(
        logs.map(async (log) => {
          const event = await AnalyticsEventRegistryModel.findById(
            this.resolveEventRef(log),
          )
            .lean()
            .exec();
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
        eventName,
        startDate,
        endDate,
        offset = "0",
      } = req.query;

      if (!apiKeyId)
        return res.status(400).json({ error: "apiKeyId is required" });
      if (!(await this.verifyKeyOwnership(req, apiKeyId as string))) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const query: Record<string, unknown> = { apiKeyId };
      const { page, limit, skip } = this.parsePagination(req);
      const legacyOffset = parseInt(offset as string, 10);
      const effectiveSkip =
        Number.isFinite(legacyOffset) && legacyOffset > 0 ? legacyOffset : skip;

      const eventNames = this.parseEventNames(req.query.eventNames);
      if (eventNames.length > 0) {
        const matchingEvents = await AnalyticsEventRegistryModel.find({
          apiKeyId,
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
          apiKeyId,
          eventName: new RegExp(eventName as string, "i"),
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

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          (query.createdAt as Record<string, Date>).$gte = new Date(
            startDate as string,
          );
        }
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          (query.createdAt as Record<string, Date>).$lte = end;
        }
      }

      // Fetch logs
      const logs = await AnalyticsLogModel.find(query)
        .sort({ createdAt: -1 })
        .skip(effectiveSkip)
        .limit(limit)
        .lean()
        .exec();

      const total = await AnalyticsLogModel.countDocuments(query);

      // Enrich logs with event names from registry
      const enrichedLogs = await Promise.all(
        logs.map(async (log) => {
          const event = await AnalyticsEventRegistryModel.findById(
            this.resolveEventRef(log),
          )
            .lean()
            .exec();
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
}

export default new AnalyticsDataController();
