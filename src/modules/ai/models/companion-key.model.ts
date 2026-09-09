import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface ICompanionKey {
  userId: Types.ObjectId | string;
  keyHash: string;
  deviceName?: string | null;
  deviceType?: string | null;
  isUsed: boolean;
  usedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICompanionKeyDocument extends ICompanionKey, Document {}

const companionKeySchema = new Schema<ICompanionKeyDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
    },
    deviceName: {
      type: String,
      default: null,
      trim: true,
    },
    deviceType: {
      type: String,
      default: null,
      trim: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

companionKeySchema.index({ userId: 1, isUsed: 1, createdAt: -1 });

const CompanionKeyModel = model<ICompanionKeyDocument>(
  "CompanionKey",
  companionKeySchema,
);

export default CompanionKeyModel;
