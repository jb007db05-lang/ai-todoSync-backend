import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type DocumentType =
  | "PRD"
  | "SPEC"
  | "BRIEF"
  | "MEETING_NOTES"
  | "ARCHITECTURE"
  | "GENERAL";

export interface IDocument {
  projectId: Types.ObjectId | string;
  workspaceId?: Types.ObjectId | string | null;
  title: string;
  type: DocumentType;
  content: string;
  authorId: Types.ObjectId | string;
  tags?: string[];
  version?: number;
  aiGenerated?: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDocumentEntity extends IDocument, Document {}

const documentSchema = new Schema<IDocumentEntity>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "PRD",
        "SPEC",
        "BRIEF",
        "MEETING_NOTES",
        "ARCHITECTURE",
        "GENERAL",
      ],
      default: "GENERAL",
    },
    content: {
      type: String,
      default: "",
    },
    authorId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    tags: {
      type: [String],
      default: [],
    },
    version: {
      type: Number,
      default: 1,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

documentSchema.index({ projectId: 1, createdAt: -1 });
documentSchema.index({ content: "text", title: "text" });

const DocumentModel = model<IDocumentEntity>("Document", documentSchema);

export default DocumentModel;
