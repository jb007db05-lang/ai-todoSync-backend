import type { Types } from "mongoose";

import { MessageType } from "../models/chat-message.model.js";
import type { IMessageMetadata } from "../models/chat-message.model.js";
import * as chatRepository from "../repositories/chat.repository.js";
import * as projectMemberRepository from "../repositories/project-member.repository.js";
import type {
  CreateMessagePayload,
  UpdateMessagePayload,
  PaginationOptions,
} from "../repositories/chat.repository.js";

interface SenderDto {
  id: string;
  email: string;
  name: string | null;
}

interface ReplyToDto {
  id: string;
  content: string;
  sender: SenderDto | null;
}

interface ReactionDto {
  userId: string;
  emoji: string;
  createdAt: Date;
}

interface MessageDto {
  id: string;
  projectId: string;
  senderId: string | null;
  sender: SenderDto | null;
  type: MessageType;
  content: string;
  replyToId: string | null;
  replyTo: ReplyToDto | null;
  readBy: string[];
  reactions: ReactionDto[];
  isEdited: boolean;
  isDeleted: boolean;
  metadata: IMessageMetadata;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageListResult {
  messages: MessageDto[];
  hasMore: boolean;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class ChatService {
  private readonly MAX_CONTENT_LENGTH = 4000;
  private readonly MAX_THREAD_DEPTH = 3;

  /**
   * Send a new message
   */
  public async sendMessage(
    projectId: string,
    senderId: string,
    content: string,
    options?: {
      type?: MessageType;
      replyToId?: string;
      metadata?: IMessageMetadata;
    },
  ): Promise<MessageDto> {
    const trimmedContent = content.trim();

    if (!trimmedContent || trimmedContent.length === 0) {
      throw new HttpError(400, "Message content is required");
    }

    // Issue #5: Validate active membership server-side
    const membership = await projectMemberRepository.getProjectMembership(
      projectId,
      senderId,
    );
    if (membership == null) {
      throw new HttpError(403, "Only active project members can send messages");
    }

    if (trimmedContent.length > this.MAX_CONTENT_LENGTH) {
      throw new HttpError(
        400,
        `Message content exceeds maximum length of ${this.MAX_CONTENT_LENGTH} characters`,
      );
    }

    // Validate replyToId if provided
    let normalizedReplyToId: string | null = null;
    if (options?.replyToId) {
      const parentMessage = await chatRepository.getMessageByIdAndProject(
        options.replyToId,
        projectId,
      );

      if (!parentMessage) {
        throw new HttpError(404, "Parent message not found");
      }

      // Check thread depth
      const depth = await this.calculateThreadDepth(options.replyToId);
      if (depth >= this.MAX_THREAD_DEPTH) {
        throw new HttpError(
          400,
          `Thread depth exceeds maximum of ${this.MAX_THREAD_DEPTH}`,
        );
      }

      normalizedReplyToId = options.replyToId;
    }

    const payload: CreateMessagePayload = {
      projectId,
      senderId,
      type: options?.type ?? MessageType.TEXT,
      content: trimmedContent,
      replyToId: normalizedReplyToId,
      metadata: options?.metadata,
    };

    const message = await chatRepository.createMessage(payload);
    return this.toDto(message);
  }

  /**
   * Send a system message (for automated notifications)
   */
  public async sendSystemMessage(
    projectId: string,
    content: string,
    metadata: IMessageMetadata,
  ): Promise<MessageDto> {
    const payload: CreateMessagePayload = {
      projectId,
      senderId: null,
      type: MessageType.SYSTEM,
      content,
      metadata,
    };

    const message = await chatRepository.createMessage(payload);
    return this.toDto(message);
  }

  /**
   * Get messages for a project
   */
  public async getMessages(
    projectId: string,
    options: PaginationOptions = {},
  ): Promise<MessageListResult> {
    const messages = await chatRepository.getMessagesByProject(projectId, {
      limit: (options.limit ?? 50) + 1, // Fetch one extra to check if there's more
      before: options.before,
      after: options.after,
    });

    const hasMore = messages.length > (options.limit ?? 50);
    const slicedMessages = hasMore ? messages.slice(0, -1) : messages;

    const messagesWithReplyCount = await Promise.all(
      slicedMessages.map(async (msg) => {
        const dto = this.toDto(msg);
        dto.replyCount = await chatRepository.getReplyCount(msg._id.toString());
        return dto;
      }),
    );

    return {
      messages: messagesWithReplyCount.reverse(), // Oldest first for display
      hasMore,
    };
  }

  /**
   * Get thread replies for a message
   */
  public async getThreadReplies(
    projectId: string,
    messageId: string,
    options: PaginationOptions = {},
  ): Promise<MessageListResult> {
    const parentMessage = await chatRepository.getMessageByIdAndProject(
      messageId,
      projectId,
    );

    if (!parentMessage) {
      throw new HttpError(404, "Message not found");
    }

    const messages = await chatRepository.getThreadReplies(messageId, {
      limit: (options.limit ?? 50) + 1,
      before: options.before,
    });

    const hasMore = messages.length > (options.limit ?? 50);
    const slicedMessages = hasMore ? messages.slice(0, -1) : messages;

    return {
      messages: slicedMessages.map((msg) => this.toDto(msg)),
      hasMore,
    };
  }

  /**
   * Edit a message
   */
  public async editMessage(
    projectId: string,
    messageId: string,
    userId: string,
    newContent: string,
  ): Promise<MessageDto> {
    const trimmedContent = newContent.trim();

    if (!trimmedContent || trimmedContent.length === 0) {
      throw new HttpError(400, "Message content is required");
    }

    if (trimmedContent.length > this.MAX_CONTENT_LENGTH) {
      throw new HttpError(
        400,
        `Message content exceeds maximum length of ${this.MAX_CONTENT_LENGTH} characters`,
      );
    }

    const message = await chatRepository.getMessageByIdAndProject(
      messageId,
      projectId,
    );

    if (!message) {
      throw new HttpError(404, "Message not found");
    }

    if (message.isDeleted) {
      throw new HttpError(400, "Cannot edit deleted message");
    }

    // Only sender can edit
    if (!message.senderId || message.senderId.toString() !== userId) {
      throw new HttpError(403, "Only the sender can edit this message");
    }

    // Build edit history
    const editHistory = message.metadata?.editHistory ?? [];
    editHistory.push({
      content: message.content,
      editedAt: new Date(),
    });

    const metadata: IMessageMetadata = {
      ...message.metadata,
      editHistory: editHistory.slice(-5), // Keep only last 5 edits
    };

    const updated = await chatRepository.updateMessage(messageId, {
      content: trimmedContent,
      isEdited: true,
      metadata,
    });

    if (!updated) {
      throw new HttpError(500, "Failed to update message");
    }

    return this.toDto(updated);
  }

  /**
   * Delete a message (soft delete)
   */
  public async deleteMessage(
    projectId: string,
    messageId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    const message = await chatRepository.getMessageByIdAndProject(
      messageId,
      projectId,
    );

    if (!message) {
      throw new HttpError(404, "Message not found");
    }

    // Only sender or admin can delete
    const isSender = message.senderId?.toString() === userId;
    if (!isSender && !isAdmin) {
      throw new HttpError(
        403,
        "Only the sender or admin can delete this message",
      );
    }

    await chatRepository.softDeleteMessage(messageId);
  }

  /**
   * Add reaction to a message
   */
  public async addReaction(
    projectId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<MessageDto> {
    const message = await chatRepository.getMessageByIdAndProject(
      messageId,
      projectId,
    );

    if (!message) {
      throw new HttpError(404, "Message not found");
    }

    if (message.isDeleted) {
      throw new HttpError(400, "Cannot react to deleted message");
    }

    const updated = await chatRepository.addReaction(messageId, userId, emoji);

    if (!updated) {
      throw new HttpError(500, "Failed to add reaction");
    }

    return this.toDto(updated);
  }

  /**
   * Remove reaction from a message
   */
  public async removeReaction(
    projectId: string,
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<MessageDto> {
    const updated = await chatRepository.removeReaction(
      messageId,
      userId,
      emoji,
    );

    if (!updated) {
      throw new HttpError(404, "Message not found");
    }

    return this.toDto(updated);
  }

  /**
   * Mark messages as read
   */
  public async markMessagesAsRead(
    projectId: string,
    userId: string,
    messageIds?: string[],
  ): Promise<void> {
    await chatRepository.markMessagesAsRead(projectId, userId, messageIds);
  }

  /**
   * Get unread message count
   */
  public async getUnreadCount(
    projectId: string,
    userId: string,
  ): Promise<number> {
    return chatRepository.getUnreadCount(projectId, userId);
  }

  /**
   * Search messages
   */
  public async searchMessages(
    projectId: string,
    query: string,
    options: PaginationOptions = {},
  ): Promise<MessageListResult> {
    if (!query.trim()) {
      return { messages: [], hasMore: false };
    }

    const messages = await chatRepository.searchMessages(
      projectId,
      query.trim(),
      {
        limit: (options.limit ?? 20) + 1,
      },
    );

    const hasMore = messages.length > (options.limit ?? 20);
    const slicedMessages = hasMore ? messages.slice(0, -1) : messages;

    return {
      messages: slicedMessages.map((msg) => this.toDto(msg)),
      hasMore,
    };
  }

  /**
   * Calculate thread depth for a message
   */
  private async calculateThreadDepth(messageId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = messageId;

    while (currentId && depth < this.MAX_THREAD_DEPTH + 1) {
      const message = await chatRepository.getMessageById(currentId);
      if (!message || !message.replyToId) {
        break;
      }
      currentId = message.replyToId.toString();
      depth++;
    }

    return depth;
  }

  /**
   * Convert document to DTO
   */
  private toDto(message: chatRepository.ChatMessageDocument): MessageDto {
    const sender = this.toSenderDto(message.senderId);
    const replyTo = message.replyToId
      ? this.toReplyToDto(
          message.replyToId as unknown as chatRepository.ChatMessageDocument,
        )
      : null;

    return {
      id: message._id.toString(),
      projectId: message.projectId.toString(),
      senderId: message.senderId?.toString() ?? null,
      sender,
      type: message.type as MessageType,
      content: message.content,
      replyToId: message.replyToId?.toString() ?? null,
      replyTo,
      readBy: message.readBy.map((id) => id.toString()),
      reactions: message.reactions.map((r) => ({
        userId: r.userId.toString(),
        emoji: r.emoji,
        createdAt: r.createdAt,
      })),
      isEdited: message.isEdited,
      isDeleted: message.isDeleted,
      metadata: message.metadata || {},
      replyCount: 0, // Will be populated separately
      createdAt: message.createdAt!,
      updatedAt: message.updatedAt!,
    };
  }

  /**
   * Convert sender to DTO
   */
  private toSenderDto(value: unknown): SenderDto | null {
    if (value == null || typeof value !== "object") {
      return null;
    }

    const sender = value as {
      _id?: Types.ObjectId;
      email?: string;
      name?: string | null;
    };

    if (!sender._id || !sender.email) {
      return null;
    }

    return {
      id: sender._id.toString(),
      email: sender.email,
      name: sender.name ?? null,
    };
  }

  /**
   * Convert reply-to to DTO
   */
  private toReplyToDto(
    value: chatRepository.ChatMessageDocument | unknown,
  ): ReplyToDto | null {
    if (value == null || typeof value !== "object") {
      return null;
    }

    const msg = value as chatRepository.ChatMessageDocument;

    if (!msg._id) {
      return null;
    }

    return {
      id: msg._id.toString(),
      content: msg.content,
      sender: this.toSenderDto(msg.senderId),
    };
  }
}

const chatService = new ChatService();

export type { MessageDto, MessageListResult };
export default chatService;
