import { Router, type Request, type Response } from "express";
import type { Routes } from "../../interfaces/routes.interface.js";
import authMiddleware from "../../middleware/auth.middleware.js";
import timeTrackingService, {
  type TimeFilters,
} from "./time-tracking.service.js";

const userIdOf = (req: Request) => req.user!._id.toString();
const param = (req: Request, name: string) => String(req.params[name] ?? "");
const query = (req: Request, name: string) => {
  const value = req.query[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};
const filtersOf = (req: Request): TimeFilters => ({
  from: query(req, "from"),
  to: query(req, "to"),
  userId: query(req, "userId"),
  taskId: query(req, "taskId"),
});

/**
 * Time tracking. Access is checked in the service: the caller must be able to
 * open the project (workspace member + project member, or workspace admin).
 */
class TimeTrackingRoutes implements Routes {
  public path = "/api";
  public router = Router();

  constructor() {
    const r = this.router;

    r.post(
      "/projects/:projectId/time-entries",
      authMiddleware,
      async (req: Request, res: Response) => {
        const entry = await timeTrackingService.createEntry(
          userIdOf(req),
          param(req, "projectId"),
          req.body ?? {},
        );
        res.status(201).json({ data: { entry } });
      },
    );

    r.get(
      "/projects/:projectId/time-entries",
      authMiddleware,
      async (req: Request, res: Response) => {
        const data = await timeTrackingService.listEntries(
          userIdOf(req),
          param(req, "projectId"),
          filtersOf(req),
          Number(query(req, "page") ?? 1) || 1,
          Number(query(req, "limit") ?? 50) || 50,
        );
        res.json({ data });
      },
    );

    r.get(
      "/projects/:projectId/time-summary",
      authMiddleware,
      async (req: Request, res: Response) => {
        res.json({
          data: await timeTrackingService.summary(
            userIdOf(req),
            param(req, "projectId"),
            filtersOf(req),
          ),
        });
      },
    );

    r.get(
      "/projects/:projectId/time-summary/by-member/:memberId",
      authMiddleware,
      async (req: Request, res: Response) => {
        res.json({
          data: await timeTrackingService.memberSummary(
            userIdOf(req),
            param(req, "projectId"),
            param(req, "memberId"),
            filtersOf(req),
          ),
        });
      },
    );

    r.patch(
      "/time-entries/:id",
      authMiddleware,
      async (req: Request, res: Response) => {
        const entry = await timeTrackingService.updateEntry(
          userIdOf(req),
          param(req, "id"),
          req.body ?? {},
        );
        res.json({ data: { entry } });
      },
    );

    r.delete(
      "/time-entries/:id",
      authMiddleware,
      async (req: Request, res: Response) => {
        res.json({
          data: await timeTrackingService.deleteEntry(
            userIdOf(req),
            param(req, "id"),
          ),
        });
      },
    );
  }
}

export default TimeTrackingRoutes;
