import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

/**
 * Typing Indicator Interface
 * Tracks which users are currently typing in a project
 * Uses TTL to automatically clean up stale indicators
 */
export interface ITypingIndicator {
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  /** When the typing started/last updated */
  updatedAt: Date;
  /** TTL field for automatic cleanup (60 seconds) */
  expireAt: Date;
}

export interface ITypingIndicatorDocument extends ITypingIndicator, Document {}

const typingIndicatorSchema = new Schema<ITypingIndicatorDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    expireAt: {
      type: Date,
      default: () => new Date(Date.now() + 60000), // 60 seconds TTL
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

// Compound index to ensure one typing indicator per user per project
typingIndicatorSchema.index({ projectId: 1, userId: 1 }, { unique: true });
// TTL index for automatic cleanup
typingIndicatorSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const TypingIndicatorModel = model<ITypingIndicatorDocument>(
  "TypingIndicator",
  typingIndicatorSchema,
);

export default TypingIndicatorModel;
