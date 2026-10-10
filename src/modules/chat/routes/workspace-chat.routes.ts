import { Router } from "express";

import { Routes } from "../../../interfaces/routes.interface.js";
import authMiddleware from "../../../middleware/auth.middleware.js";
import chatController from "../controllers/chat.controller.js";

class WorkspaceChatRoutes implements Routes {
  public path = "/api/workspaces/:workspaceId/chat";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);

    this.router.get("/messages", chatController.getWorkspaceMessages);
    this.router.post("/messages", chatController.sendWorkspaceMessage);
  }
}

export default WorkspaceChatRoutes;
