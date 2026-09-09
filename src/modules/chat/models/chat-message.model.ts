import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

/**
 * Message Types - Extensible for future message types
 * TEXT: Regular user messages
 * SYSTEM: System-generated messages (e.g., "task created", "user joined")
 * AI: Messages from AI agents/assistants
 */
export enum MessageType {
  TEXT = "TEXT",
  SYSTEM = "SYSTEM",
  AI = "AI",
}

/**
 * Message metadata for extensibility
 * Can store additional data based on message type
 */
export interface IMessageMetadata {
  /** For SYSTEM messages: action type (e.g., 'task_created', 'user_joined') */
  action?: string;
  /** For SYSTEM messages: related entity ID */
  entityId?: string;
  /** For SYSTEM messages: related entity type */
  entityType?: string;
  /** For AI messages: model name, request ID, etc. */
  aiContext?: {
    model?: string;
    requestId?: string;
    promptTokens?: number;
    completionTokens?: number;
  };
  /** For edited messages: edit history */
  editHistory?: {
    content: string;
    editedAt: Date;
  }[];
  /** Custom data for future extensions */
  [key: string]: unknown;
}

/**
 * Individual reaction on a message
 */
export interface IMessageReaction {
  userId: Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

/**
 * Chat Message Interface
 * Designed for extensibility with message types, threading, and reactions
 */
export interface IChatMessage {
  projectId: Types.ObjectId;
  /** Sender ID - null for SYSTEM messages */
  senderId: Types.ObjectId | null;
  /** Message type for extensibility */
  type: MessageType;
  /** Message content */
  content: string;
  /** For threading - ID of parent message */
  replyToId: Types.ObjectId | null;
  /** Array of user IDs who have read this message */
  readBy: Types.ObjectId[];
  /** Reactions on this message */
  reactions: IMessageReaction[];
  /** Whether the message has been edited */
  isEdited: boolean;
  /** Soft delete flag */
  isDeleted: boolean;
  /** Metadata for extensibility */
  metadata: IMessageMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document {}

const messageReactionSchema = new Schema<IMessageReaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    emoji: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const chatMessageSchema = new Schema<IChatMessageDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(MessageType),
      default: MessageType.TEXT,
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    replyToId: {
      type: Schema.Types.ObjectId,
      ref: "ChatMessage",
      default: null,
      index: true,
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reactions: [messageReactionSchema],
    isEdited: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

// Compound indexes for efficient querying
// Messages by project, sorted by creation time (for chat history)
chatMessageSchema.index({ projectId: 1, createdAt: -1 });
// Messages by project and type (for filtering)
chatMessageSchema.index({ projectId: 1, type: 1, createdAt: -1 });
// Thread replies
chatMessageSchema.index({ replyToId: 1, createdAt: 1 });
// Unread messages for a user
chatMessageSchema.index({ projectId: 1, senderId: 1, createdAt: -1 });
// Full-text search on content
chatMessageSchema.index({ content: "text" });

const ChatMessageModel = model<IChatMessageDocument>(
  "ChatMessage",
  chatMessageSchema,
);

export default ChatMessageModel;
