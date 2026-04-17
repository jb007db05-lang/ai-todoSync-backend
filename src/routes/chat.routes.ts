import { Router } from "express";

import { Routes } from "../interfaces/routes.interface.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { isProjectMember } from "../middleware/project-access.middleware.js";
import chatController from "../controllers/chat.controller.js";

class ChatRoutes implements Routes {
  public path = "/api/projects/:projectId/chat";
  public router = Router({ mergeParams: true });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(authMiddleware);
    this.router.use(isProjectMember);

    // Message CRUD
    this.router.get("/messages", chatController.getMessages);
    this.router.post("/messages", chatController.sendMessage);
    this.router.put("/messages/:messageId", chatController.editMessage);
    this.router.delete("/messages/:messageId", chatController.deleteMessage);

    // Thread replies
    this.router.get(
      "/messages/:messageId/replies",
      chatController.getThreadReplies,
    );

    // Reactions
    this.router.post(
      "/messages/:messageId/reactions",
      chatController.addReaction,
    );
    this.router.delete(
      "/messages/:messageId/reactions",
      chatController.removeReaction,
    );

    // Read status
    this.router.post("/messages/read", chatController.markMessagesAsRead);
    this.router.get("/messages/unread-count", chatController.getUnreadCount);

    // Search
    this.router.get("/search", chatController.searchMessages);
  }
}

export default ChatRoutes;
