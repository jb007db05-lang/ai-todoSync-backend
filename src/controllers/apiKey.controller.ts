import { Request, Response } from "express";
import AnalyticsKeyModel from "../models/analytics-key.model.js";
import { generateApiKey } from "../utils/crypto.js";

class ApiKeyController {
  /**
   * POST /api/keys
   * Creates a new API key. Returns the raw key ONLY once.
   */
  public createKey = async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      const userId = (req as any).user?.id; // Assuming authMiddleware provides this

      if (!name) {
        return res.status(400).json({ error: "Key name is required" });
      }

      const rawKey = generateApiKey();

      const newKey = await AnalyticsKeyModel.create({
        userId,
        name,
        hashedKey: rawKey,
        status: "active",
      });

      // IMPORTANT: Return rawKey only once
      res.status(201).json({
        id: newKey._id,
        name: newKey.name,
        key: rawKey,
        status: newKey.status,
        createdAt: newKey.createdAt,
      });
    } catch (error) {
      console.error("Create API Key error:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  };

  /**
   * GET /api/keys
   * Lists all keys for the user (masked).
   */
  public listKeys = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const keys = await AnalyticsKeyModel.find({ userId }).sort({
        createdAt: -1,
      });

      // Mask keys before returning
      const maskedKeys = keys.map((k) => ({
        id: k._id,
        name: k.name,
        status: k.status,
        createdAt: k.createdAt,
        // Provide masked version for UI
        maskedKey: `ak_••••••••${k.hashedKey.slice(-4)}`,
      }));

      res.status(200).json(maskedKeys);
    } catch (error) {
      console.error("List API Keys error:", error);
      res.status(500).json({ error: "Failed to list API keys" });
    }
  };

  /**
   * DELETE /api/keys/:id
   */
  public deleteKey = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;

      const result = await AnalyticsKeyModel.findOneAndDelete({
        _id: id,
        userId,
      });

      if (!result) {
        return res.status(404).json({ error: "Key not found or unauthorized" });
      }

      res.status(200).json({ message: "Key deleted successfully" });
    } catch (error) {
      console.error("Delete API Key error:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  };
}

export default new ApiKeyController();
