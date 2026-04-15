import type { Response } from "express";

import projectService from "../services/project.service.js";
import type { AuthenticatedRequest } from "../types/auth.js";

class UserController {
  public searchUsers = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> => {
    try {
      if (req.user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const users = await projectService.searchRegisteredUsersByEmail(
        req.query.email,
      );

      res.status(200).json({
        message: "Users fetched",
        data: { users },
      });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

export default new UserController();
