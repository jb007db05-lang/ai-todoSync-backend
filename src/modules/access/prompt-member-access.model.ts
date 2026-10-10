import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

/**
 * An individual grant: one teammate may open one prompt. Grants target the
 * prompt's root id, so they survive new versions of the prompt.
 */
export interface IPromptMemberAccess {
  workspaceId: Types.ObjectId | string;
  promptId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  grantedBy: Types.ObjectId | string;
  grantedAt: Date;
}

export interface IPromptMemberAccessDocument
  extends IPromptMemberAccess, Document {}

const promptMemberAccessSchema = new Schema<IPromptMemberAccessDocument>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: "Workspace",
    required: true,
  },
  promptId: {
    type: Schema.Types.ObjectId,
    ref: "PromptLibrary",
    required: true,
  },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  grantedAt: { type: Date, default: Date.now },
});

promptMemberAccessSchema.index({ promptId: 1, userId: 1 }, { unique: true });
promptMemberAccessSchema.index({ workspaceId: 1, userId: 1 });

const PromptMemberAccessModel = model<IPromptMemberAccessDocument>(
  "PromptMemberAccess",
  promptMemberAccessSchema,
);

export default PromptMemberAccessModel;
