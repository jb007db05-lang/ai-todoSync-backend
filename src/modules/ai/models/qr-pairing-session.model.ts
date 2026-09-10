import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type QRPairingSessionStatus = "pending" | "paired" | "expired";

export interface IQRPairingSession {
  sessionId: string;
  userId: Types.ObjectId | string;
  workspaceId?: Types.ObjectId | string | null;
  qrToken: string;
  status: QRPairingSessionStatus;
  isUsed: boolean;
  usedAt?: Date | null;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IQRPairingSessionDocument
  extends IQRPairingSession, Document {}

const qrPairingSessionSchema = new Schema<IQRPairingSessionDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    qrToken: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "paired", "expired"],
      default: "pending",
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // Automatically remove document after expiration
    },
  },
  { timestamps: true },
);

qrPairingSessionSchema.index({ sessionId: 1, qrToken: 1 });

const QRPairingSessionModel = model<IQRPairingSessionDocument>(
  "QRPairingSession",
  qrPairingSessionSchema,
);

export default QRPairingSessionModel;
