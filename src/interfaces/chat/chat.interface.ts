import type { Types } from "mongoose";

export enum MessageType {
  TEXT = "TEXT",
  SYSTEM = "SYSTEM",
  AI = "AI",
}

export interface IMessageMetadata {
  action?: string;
  entityId?: string;
  entityType?: string;
  aiContext?: {
    model?: string;
    requestId?: string;
    promptTokens?: number;
    completionTokens?: number;
  };
  editHistory?: {
    content: string;
    editedAt: Date;
  }[];
  [key: string]: unknown;
}

export interface IMessageReaction {
  userId: Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

export interface IChatMessage {
  projectId: Types.ObjectId;
  senderId: Types.ObjectId | null;
  type: MessageType;
  content: string;
  replyToId: Types.ObjectId | null;
  readBy: Types.ObjectId[];
  reactions: IMessageReaction[];
  isEdited: boolean;
  isDeleted: boolean;
  metadata: IMessageMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITypingIndicator {
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  updatedAt: Date;
  expireAt: Date;
}

export interface IMessageMention {
  messageId: Types.ObjectId | string;
  projectId: Types.ObjectId | string;
  mentionedUserId: Types.ObjectId | string;
  mentionedByUserId: Types.ObjectId | string;
  createdAt?: Date;
}

export interface IMessageShare {
  sourceProjectId: Types.ObjectId | string;
  targetProjectId: Types.ObjectId | string;
  sourceMessageId: Types.ObjectId | string;
  targetMessageId: Types.ObjectId | string;
  sharedByUserId: Types.ObjectId | string;
  createdAt?: Date;
}
