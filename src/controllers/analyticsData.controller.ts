import { Request, Response } from "express";
import AnalyticsKeyModel from "../models/analytics-key.model.js";
import AnalyticsEventRegistryModel from "../models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../models/analytics-log.model.js";
import AnalyticsUserModel from "../models/analytics-user.model.js";

class AnalyticsDataController {
  /**
   * Helper to verify if the requesting user owns the API key ID.
   */
  private verifyKeyOwnership = async (req: Request, apiKeyId: string) => {
    const userId = (req as any).user?.id;
    const key = await AnalyticsKeyModel.findOne({ _id: apiKeyId, userId });
    return !!key;
  };

  /**
   * GET /api/events?apiKeyId=
   */
  public getEvents = async (req: Request, res: Response) => {
    try {
      const { apiKeyId, eventName, startDate, endDate } = req.query;
      
      if (!apiKeyId) return res.status(400).json({ error: "apiKeyId is required" });
      if (!await this.verifyKeyOwnership(req, apiKeyId as string)) {
        return res.status(403).json({ error: "Unauthorized access to this API key's data" });
      }

      const query: any = { apiKeyId };
      if (eventName) query.eventName = new RegExp(eventName as string, "i");

      const events = await AnalyticsEventRegistryModel.find(query);
      
      // Enrich with counts
      const enrichedEvents = await Promise.all(events.map(async (event) => {
        const logQuery: any = { eventId: event._id, apiKeyId };
        if (startDate || endDate) {
          logQuery.createdAt = {};
          if (startDate) logQuery.createdAt.$gte = new Date(startDate as string);
          if (endDate) logQuery.createdAt.$lte = new Date(endDate as string);
        }
        const count = await AnalyticsLogModel.countDocuments(logQuery);
        return {
          id: event._id,
          eventName: event.eventName,
          count,
          createdAt: event.createdAt,
        };
      }));

      res.status(200).json(enrichedEvents);
    } catch (error) {
      console.error("Get events error:", error);
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

      if (!apiKeyId) return res.status(400).json({ error: "apiKeyId is required" });
      if (!await this.verifyKeyOwnership(req, apiKeyId as string)) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const logs = await AnalyticsLogModel.find({ eventId, apiKeyId })
        .sort({ createdAt: -1 })
        .limit(100);

      res.status(200).json(logs);
    } catch (error) {
      console.error("Get logs error:", error);
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  };

  /**
   * GET /api/users?apiKeyId=
   */
  public getUsers = async (req: Request, res: Response) => {
    try {
      const { apiKeyId } = req.query;

      if (!apiKeyId) return res.status(400).json({ error: "apiKeyId is required" });
      if (!await this.verifyKeyOwnership(req, apiKeyId as string)) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const users = await AnalyticsUserModel.find({ apiKeyId }).sort({ createdAt: -1 });
      res.status(200).json(users);
    } catch (error) {
      console.error("Get users error:", error);
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

      if (!apiKeyId) return res.status(400).json({ error: "apiKeyId is required" });
      if (!await this.verifyKeyOwnership(req, apiKeyId as string)) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      const logs = await AnalyticsLogModel.find({ userIdentifier: identifier, apiKeyId })
        .sort({ createdAt: -1 });

      // Enrich logs with event names
      const enrichedLogs = await Promise.all(logs.map(async (log) => {
        const event = await AnalyticsEventRegistryModel.findById(log.eventId);
        return {
          ...log.toObject(),
          eventName: event?.eventName || "Unknown",
        };
      }));

      res.status(200).json(enrichedLogs);
    } catch (error) {
      console.error("Get user events error:", error);
      res.status(500).json({ error: "Failed to fetch user events" });
    }
  };
}

export default new AnalyticsDataController();
