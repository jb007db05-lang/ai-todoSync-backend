import { Request, Response } from "express";
import { SdkAuthService } from "../services/sdkAuth.service.js";

class SdkAuthController {
  /**
   * POST /api/sdk/authenticate
   * Performs the initial authentication handshake for the SDK.
   */
  public authenticate = async (req: Request, res: Response): Promise<void> => {
    try {
      const sdkKey =
        req.body.sdkKey ||
        req.body.apiKey ||
        req.headers["x-sdk-key"] ||
        req.headers["x-api-key"];
      const origin = req.body.origin || req.headers.origin;

      if (!sdkKey) {
        res.status(400).json({ error: "SDK key is required" });
        return;
      }

      if (!origin) {
        res.status(400).json({ error: "Origin is required" });
        return;
      }

      const session = await SdkAuthService.authenticate(
        sdkKey as string,
        origin as string,
      );

      res.status(200).json({
        sessionId: session.sessionId,
        sessionSecret: session.sessionSecret,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (error: any) {
      const status = error.status || 401;
      res
        .status(status)
        .json({ error: error.message || "Authentication failed" });
    }
  };

  /**
   * POST /api/sdk/session/renew
   * Renews the active session. This must be a signed runtime request.
   */
  public renew = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["x-session-id"] as string;
      if (!sessionId) {
        res.status(400).json({ error: "Session ID is required" });
        return;
      }

      const session = await SdkAuthService.renewSession(sessionId);
      res.status(200).json({
        sessionId: session.sessionId,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (error: any) {
      res.status(401).json({ error: error.message || "Renewal failed" });
    }
  };

  /**
   * POST /api/sdk/session/revoke
   * Revokes the active session.
   */
  public revoke = async (req: Request, res: Response): Promise<void> => {
    try {
      const sessionId = req.headers["x-session-id"] as string;
      if (!sessionId) {
        res.status(400).json({ error: "Session ID is required" });
        return;
      }

      await SdkAuthService.revokeSession(sessionId);
      res.status(200).json({ message: "Session revoked successfully" });
    } catch (error: any) {
      res.status(401).json({ error: error.message || "Revocation failed" });
    }
  };
}

export default new SdkAuthController();
