import { Request, Response } from "express";
import type { IUserDocument } from "../models/user.model.js";
import analyticsService from "../services/analytics.service.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

class AnalyticsController {
  public generateKey = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { name } = req.body;
      const key = await analyticsService.generateKey(user._id.toString(), name);

      res.status(201).json({
        message: "API Key generated",
        data: { key },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public listKeys = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const keys = await analyticsService.listKeys(user._id.toString());
      res.status(200).json({
        message: "API Keys fetched",
        data: { keys },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public revokeKey = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { id } = req.params;
      await analyticsService.revokeKey(user._id.toString(), id as string);

      res.status(200).json({
        message: "API Key revoked",
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public regenerateKey = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { id } = req.params;
      const key = await analyticsService.regenerateKey(
        user._id.toString(),
        id as string,
      );

      res.status(200).json({
        message: "API Key regenerated",
        data: { key },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public ingestEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const apiHeader = req.headers["x-api-key"];
      const apiKey = Array.isArray(apiHeader) ? apiHeader[0] : apiHeader;
      if (!apiKey) {
        res.status(401).json({ error: "API Key required (X-API-Key header)" });
        return;
      }

      const body = req.body;

      if (Array.isArray(body)) {
        await analyticsService.ingestBatch(apiKey as string, body);
      } else {
        const { event, properties, ...metadata } = body;
        if (!event) {
          res.status(400).json({ error: "Event name is required" });
          return;
        }
        await analyticsService.ingestEvent(
          apiKey as string,
          event,
          properties,
          metadata,
        );
      }

      res.status(202).json({
        message: "Events ingested",
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public listEvents = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { keyId, eventName, limit, offset } = req.query;
      const result = await analyticsService.getEvents(user._id.toString(), {
        keyId: keyId as string,
        eventName: eventName as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.status(200).json({
        message: "Analytics events fetched",
        data: result,
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public getStats = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { keyId } = req.query;
      const stats = await analyticsService.getStats(
        user._id.toString(),
        keyId as string,
      );
      res.status(200).json({
        message: "Analytics stats fetched",
        data: { stats },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new AnalyticsController();
