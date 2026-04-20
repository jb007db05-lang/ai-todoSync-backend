import { Request, Response } from "express";
import AnalyticsEventRegistryModel from "../models/analytics-event-registry.model.js";
import AnalyticsLogModel from "../models/analytics-log.model.js";
import AnalyticsUserModel from "../models/analytics-user.model.js";

class TrackingController {
  /**
   * POST /api/track
   */
  public track = async (req: Request, res: Response) => {
    try {
      const { eventName, payload } = req.body;
      const apiKeyId = (req as any).apiKeyId;

      if (!eventName) {
        return res.status(400).json({ error: "Event name is required" });
      }

      // 1. Ensure event is registered
      let event: any = await AnalyticsEventRegistryModel.findOne({ eventName, apiKeyId });
      if (!event) {
        event = await AnalyticsEventRegistryModel.create({ eventName, apiKeyId });
      }

      // 2. Store log
      const log = await AnalyticsLogModel.create({
        eventId: event._id,
        apiKeyId,
        payload: payload || {},
      });

      res.status(200).json({ success: true, logId: log._id });
    } catch (error) {
      console.error("Track error:", error);
      res.status(500).json({ error: "Failed to track event" });
    }
  };

  /**
   * POST /api/identify-track
   */
  public identifyTrack = async (req: Request, res: Response) => {
    try {
      const { userIdentifier, eventName, payload } = req.body;
      const apiKeyId = (req as any).apiKeyId;

      if (!userIdentifier || !eventName) {
        return res.status(400).json({ error: "userIdentifier and eventName are required" });
      }

      // 1. Upsert Identified User
      await AnalyticsUserModel.findOneAndUpdate(
        { userIdentifier, apiKeyId },
        { $setOnInsert: { createdAt: new Date() } },
        { upsert: true, new: true }
      );

      // 2. Ensure event is registered
      let event: any = await AnalyticsEventRegistryModel.findOne({ eventName, apiKeyId });
      if (!event) {
        event = await AnalyticsEventRegistryModel.create({ eventName, apiKeyId });
      }

      // 3. Store log
      const log = await AnalyticsLogModel.create({
        eventId: event._id,
        apiKeyId,
        userIdentifier,
        payload: payload || {},
      });

      res.status(200).json({ success: true, logId: log._id });
    } catch (error) {
      console.error("Identify track error:", error);
      res.status(500).json({ error: "Failed to identify and track" });
    }
  };
}

export default new TrackingController();
