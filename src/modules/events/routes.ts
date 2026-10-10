import { Router } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import { requireSdkIntegrationAccess } from "../../middleware/sdkIntegrationAuth.middleware.js";
import eventsController from "./controller.js";

/**
 * Events page and Lexicon for one integration. Middleware is attached per
 * route, not router-wide: this router is mounted under /api/sdk-integrations,
 * which also serves SDK-key routes that must not require a portal login.
 */
class EventsRoutes implements Routes {
  public path = "/api/sdk-integrations";
  public router = Router();

  constructor() {
    const guard = [authMiddleware, requireSdkIntegrationAccess];
    this.router.get(
      "/:sdkIntegrationId/event-stream",
      ...guard,
      eventsController.stream,
    );
    this.router.get(
      "/:sdkIntegrationId/event-stream/export",
      ...guard,
      eventsController.exportCsv,
    );
    this.router.get(
      "/:sdkIntegrationId/event-properties",
      ...guard,
      eventsController.propertyKeys,
    );
    this.router.get(
      "/:sdkIntegrationId/user-profiles/:distinctId",
      ...guard,
      eventsController.userProfile,
    );
    this.router.get(
      "/:sdkIntegrationId/lexicon/events",
      ...guard,
      eventsController.lexicon,
    );
    this.router.patch(
      "/:sdkIntegrationId/lexicon/events/:eventId",
      ...guard,
      eventsController.updateLexiconEvent,
    );
  }
}

export default EventsRoutes;
