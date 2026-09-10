import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import {
  createCompanionDevice,
  getCompanionDevices,
  createQrPairingSession,
  getQrSessionStatus,
  pairCompanionDeviceWithKey,
  pairCompanionDeviceWithQr,
  regenerateCompanionKey,
  updateCompanionDeviceHandler,
  revokeCompanionDeviceHandler,
} from "../controllers/companion.controller.js";

class CompanionRoutes implements Routes {
  public path = "/api/companion";
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const pairRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      message: { error: "Too many pairing attempts, please try again later." },
    });

    // Public Pairing Endpoints for Companion Device login
    this.router.post("/pair/key", pairRateLimiter, pairCompanionDeviceWithKey);
    this.router.post("/pair/qr", pairRateLimiter, pairCompanionDeviceWithQr);

    // Authenticated Endpoints for Primary Device management
    this.router.use(authMiddleware);

    this.router.post("/devices", createCompanionDevice);
    this.router.post("/pairing-key", createCompanionDevice);
    this.router.get("/devices", getCompanionDevices);
    this.router.post("/qr-session", createQrPairingSession);
    this.router.get("/qr-session/:sessionId", getQrSessionStatus);
    this.router.post("/devices/:deviceId/regenerate", regenerateCompanionKey);
    this.router.patch("/devices/:deviceId", updateCompanionDeviceHandler);
    this.router.delete("/devices/:deviceId", revokeCompanionDeviceHandler);
  }
}

export default CompanionRoutes;
