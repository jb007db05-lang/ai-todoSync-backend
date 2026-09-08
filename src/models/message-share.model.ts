import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IMessageShare {
  sourceProjectId: Types.ObjectId | string;
  targetProjectId: Types.ObjectId | string;
  sourceMessageId: Types.ObjectId | string;
  targetMessageId: Types.ObjectId | string;
  sharedByUserId: Types.ObjectId | string;
  createdAt?: Date;
}

export interface IMessageShareDocument extends IMessageShare, Document {}

const messageShareSchema = new Schema<IMessageShareDocument>(
  {
    sourceProjectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    targetProjectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    sourceMessageId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "ChatMessage",
    },
    targetMessageId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "ChatMessage",
    },
    sharedByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  { timestamps: true },
);

const MessageShareModel = model<IMessageShareDocument>(
  "MessageShare",
  messageShareSchema,
);

export default MessageShareModel;
