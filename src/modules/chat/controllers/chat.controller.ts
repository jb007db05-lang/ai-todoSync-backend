import type { Request, Response } from "express";

import type { IUserDocument } from "../../auth/models/user.model.js";
import { MessageType } from "../models/chat-message.model.js";
import type { IMessageMetadata } from "../models/chat-message.model.js";
import chatService from "../services/chat.service.js";
import type { PaginationOptions } from "../repositories/chat.repository.js";

type AuthenticatedRequest = Request & { user?: IUserDocument };
type AuthenticatedRequestWithProject = AuthenticatedRequest & {
  projectId?: string;
  projectRole?: "ADMIN" | "MEMBER";
};

interface SendMessageRequestBody {
  content?: string;
  replyToId?: string;
  type?: MessageType;
  metadata?: IMessageMetadata;
}

interface EditMessageRequestBody {
  content?: string;
}

interface AddReactionRequestBody {
  emoji?: string;
}

interface SearchMessagesQuery {
  q?: string;
}

class ChatController {
  /**
   * Get messages for a project
   */
  public getMessages = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      const paginationOptions: PaginationOptions = {
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
        before: (req.query.before as string) || undefined,
        after: (req.query.after as string) || undefined,
      };

      const result = await chatService.getMessages(
        projectId as string,
        paginationOptions,
      );

      res.status(200).json({
        message: "Messages fetched successfully",
        data: result,
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Send a new message
   */
  public sendMessage = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();
      const { content, replyToId, type, metadata } =
        req.body as SendMessageRequestBody;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      if (!content || content.trim().length === 0) {
        res.status(400).json({ error: "Message content is required" });
        return;
      }

      const message = await chatService.sendMessage(
        projectId as string,
        user._id.toString(),
        content,
        {
          replyToId,
          type: type || MessageType.TEXT,
          metadata,
        },
      );

      res.status(201).json({
        message: "Message sent successfully",
        data: { message },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Edit a message
   */
  public editMessage = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        (req.params.projectId as string) ||
        req.projectAccess?.project._id.toString();
      const messageId = req.params.messageId as string;
      const { content } = req.body as EditMessageRequestBody;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      if (!messageId) {
        res.status(400).json({ error: "Message ID is required" });
        return;
      }

      if (!content || content.trim().length === 0) {
        res.status(400).json({ error: "Message content is required" });
        return;
      }

      const message = await chatService.editMessage(
        projectId,
        messageId,
        user._id.toString(),
        content,
      );

      res.status(200).json({
        message: "Message updated successfully",
        data: { message },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Delete a message (soft delete)
   */
  public deleteMessage = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();
      const messageId = req.params.messageId as string;
      const isAdmin =
        req.projectRole === "ADMIN" || req.projectAccess?.role === "ADMIN";

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      if (!messageId) {
        res.status(400).json({ error: "Message ID is required" });
        return;
      }

      await chatService.deleteMessage(
        projectId as string,
        messageId,
        user._id.toString(),
        isAdmin,
      );

      res.status(200).json({
        message: "Message deleted successfully",
        data: { id: messageId },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Get thread replies for a message
   */
  public getThreadReplies = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();
      const messageId = req.params.messageId as string;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      if (!messageId) {
        res.status(400).json({ error: "Message ID is required" });
        return;
      }

      const paginationOptions: PaginationOptions = {
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
        before: (req.query.before as string) || undefined,
      };

      const result = await chatService.getThreadReplies(
        projectId as string,
        messageId,
        paginationOptions,
      );

      res.status(200).json({
        message: "Thread replies fetched successfully",
        data: result,
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Add reaction to a message
   */
  public addReaction = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        (req.params.projectId as string) ||
        req.projectAccess?.project._id.toString();
      const messageId = req.params.messageId as string;
      const { emoji } = req.body as AddReactionRequestBody;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      if (!messageId) {
        res.status(400).json({ error: "Message ID is required" });
        return;
      }

      if (!emoji) {
        res.status(400).json({ error: "Emoji is required" });
        return;
      }

      const message = await chatService.addReaction(
        projectId,
        messageId,
        user._id.toString(),
        emoji,
      );

      res.status(200).json({
        message: "Reaction added successfully",
        data: { message },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Remove reaction from a message
   */
  public removeReaction = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        (req.params.projectId as string) ||
        req.projectAccess?.project._id.toString();
      const messageId = req.params.messageId as string;
      const emoji = req.query.emoji as string;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      if (!messageId) {
        res.status(400).json({ error: "Message ID is required" });
        return;
      }

      if (!emoji) {
        res.status(400).json({ error: "Emoji is required" });
        return;
      }

      const message = await chatService.removeReaction(
        projectId,
        messageId,
        user._id.toString(),
        emoji,
      );

      res.status(200).json({
        message: "Reaction removed successfully",
        data: { message },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Mark messages as read
   */
  public markMessagesAsRead = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();
      const { messageIds } = req.body as { messageIds?: string[] };

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      await chatService.markMessagesAsRead(
        projectId as string,
        user._id.toString(),
        messageIds,
      );

      res.status(200).json({
        message: "Messages marked as read",
        data: {},
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Get unread message count
   */
  public getUnreadCount = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      const count = await chatService.getUnreadCount(
        projectId as string,
        user._id.toString(),
      );

      res.status(200).json({
        message: "Unread count fetched",
        data: { count },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Search messages
   */
  public searchMessages = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const projectId =
        req.params.projectId || req.projectAccess?.project._id.toString();
      const { q } = req.query as SearchMessagesQuery;

      if (user == null) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (projectId == null) {
        res.status(400).json({ error: "Project ID is required" });
        return;
      }

      const paginationOptions: PaginationOptions = {
        limit: Math.min(parseInt(req.query.limit as string) || 20, 50),
      };

      const result = await chatService.searchMessages(
        projectId as string,
        q || "",
        paginationOptions,
      );

      res.status(200).json({
        message: "Search results fetched",
        data: result,
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Share a message across projects
   */
  public shareMessage = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const { messageId } = req.params as Record<string, string>;
      const { targetProjectId } = req.body;

      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!messageId || !targetProjectId) {
        res
          .status(400)
          .json({ error: "messageId and targetProjectId are required" });
        return;
      }

      const sharedMessage = await chatService.shareMessageToProject(
        user._id.toString(),
        messageId,
        targetProjectId,
      );

      res.status(201).json({
        message: "Message shared successfully",
        data: { message: sharedMessage },
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };

  /**
   * Create a task directly from a chat message
   */
  public createTaskFromMessage = async (
    req: AuthenticatedRequestWithProject,
    res: Response,
  ): Promise<void> => {
    try {
      const user = req.user;
      const { messageId } = req.params as Record<string, string>;
      const { title, priority } = req.body;

      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!messageId) {
        res.status(400).json({ error: "messageId is required" });
        return;
      }

      const result = await chatService.createTaskFromMessage(
        user._id.toString(),
        messageId,
        { title, priority },
      );

      res.status(201).json({
        message: "Task created from message successfully",
        data: result,
      });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ error: (error as Error).message });
    }
  };
}

const chatController = new ChatController();
export default chatController;
