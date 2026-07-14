import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IInvitation {
  projectId: Types.ObjectId | string;
  email: string;
  role: "ADMIN" | "MEMBER";
  token: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  invitedBy: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IInvitationDocument extends IInvitation, Document {}

const invitationSchema = new Schema<IInvitationDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["ADMIN", "MEMBER"],
      required: true,
      default: "MEMBER",
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      required: true,
      default: "PENDING",
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  { timestamps: true },
);

invitationSchema.index({ projectId: 1, email: 1 }, { unique: true });
invitationSchema.index({ token: 1 });

const InvitationModel = model<IInvitationDocument>(
  "Invitation",
  invitationSchema,
);

export default InvitationModel;
