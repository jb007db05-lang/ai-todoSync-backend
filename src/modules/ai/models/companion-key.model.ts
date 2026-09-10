import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface ICompanionKey {
  userId: Types.ObjectId | string;
  workspaceId?: Types.ObjectId | string | null;
  keyHash: string;
  deviceName?: string | null;
  deviceType?: string | null;
  qrToken?: string | null;
  qrExpiresAt?: Date | null;
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
    workspaceId: {
      type: Schema.Types.ObjectId,
      default: null,
      ref: "Workspace",
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
    qrToken: {
      type: String,
      default: null,
      index: true,
    },
    qrExpiresAt: {
      type: Date,
      default: null,
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

companionKeySchema.index({
  userId: 1,
  workspaceId: 1,
  isUsed: 1,
  createdAt: -1,
});

const CompanionKeyModel = model<ICompanionKeyDocument>(
  "CompanionKey",
  companionKeySchema,
);

export default CompanionKeyModel;
