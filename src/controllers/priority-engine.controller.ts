import type { Request, Response } from "express";

import type { IUserDocument } from "../models/user.model.js";
import priorityEngineService from "../services/priority-engine.service.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };

class PriorityEngineController {
  public evaluateTask = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const taskId =
        typeof req.params.taskId === "string" ? req.params.taskId : "";
      const evaluation = await priorityEngineService.evaluateTaskForUser(
        taskId,
        user._id.toString(),
      );
      res.json({
        message: "Priority evaluation complete",
        data: { evaluation },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  public recalculate = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const evaluations = await priorityEngineService.recalculateForUser(
        user._id.toString(),
      );
      res.json({
        message: "Dynamic priority recalculated",
        data: { count: evaluations.length, evaluations },
      });
    } catch (error) {
      const status = (error as any).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new PriorityEngineController();
