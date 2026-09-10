import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type CompanionDeviceStatus = "active" | "revoked";

export interface ICompanionDevice {
  userId: Types.ObjectId | string;
  deviceName: string;
  deviceType: string;
  slot: number;
  status: CompanionDeviceStatus;
  revokedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICompanionDeviceDocument extends ICompanionDevice, Document {}

const companionDeviceSchema = new Schema<ICompanionDeviceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
    },
    deviceType: {
      type: String,
      default: "companion",
      trim: true,
    },
    slot: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

companionDeviceSchema.index({ userId: 1, status: 1, updatedAt: -1 });
companionDeviceSchema.index(
  { userId: 1, slot: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);

const CompanionDeviceModel = model<ICompanionDeviceDocument>(
  "CompanionDevice",
  companionDeviceSchema,
);

export default CompanionDeviceModel;
