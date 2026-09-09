import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IMessageMention {
  messageId: Types.ObjectId | string;
  projectId: Types.ObjectId | string;
  mentionedUserId: Types.ObjectId | string;
  mentionedByUserId: Types.ObjectId | string;
  createdAt?: Date;
}

export interface IMessageMentionDocument extends IMessageMention, Document {}

const messageMentionSchema = new Schema<IMessageMentionDocument>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "ChatMessage",
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    mentionedUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },
    mentionedByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  { timestamps: true },
);

messageMentionSchema.index({ mentionedUserId: 1, createdAt: -1 });

const MessageMentionModel = model<IMessageMentionDocument>(
  "MessageMention",
  messageMentionSchema,
);

export default MessageMentionModel;
