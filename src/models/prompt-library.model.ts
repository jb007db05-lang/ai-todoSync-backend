import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export const PROMPT_CATEGORIES = [
  "general",
  "development",
  "backend",
  "frontend",
  "database",
  "ui-ux",
  "documentation",
  "testing",
  "devops",
  "deployment",
  "ai",
  "security",
  "performance",
  "custom",
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const PROMPT_VISIBILITIES = [
  "private",
  "project",
  "organization",
] as const;
export type PromptVisibility = (typeof PROMPT_VISIBILITIES)[number];

export interface IPromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface IPromptVariable {
  name: string;
  type?: "string" | "number" | "json" | "boolean" | "enum";
  description?: string;
  defaultValue?: string;
  required: boolean;
  options?: string[]; // for enum type
}

export interface IPromptLibrary {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  folderId?: Types.ObjectId | string | null;
  name: string;
  slug?: string;
  description: string;
  category: PromptCategory;
  tags: string[];
  body: string; // fallback string representation
  messages?: IPromptMessage[]; // multi-role block support
  variables: IPromptVariable[];
  visibility: PromptVisibility;
  createdBy: Types.ObjectId | string;
  version: number;
  hash?: string; // SHA-256 canonical hash
  isLatest: boolean;
  parentId?: Types.ObjectId | string | null; // points to root prompt for versions
  isFavorite: boolean;
  isArchived: boolean;
  isTemplate: boolean; // built-in starter template
  usageCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptLibraryDocument extends IPromptLibrary, Document {}

export const promptVariableSchemaDefinition = {
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ["string", "number", "json", "boolean", "enum"],
    default: "string",
  },
  description: { type: String, default: "" },
  defaultValue: { type: String, default: "" },
  required: { type: Boolean, default: false },
  options: [{ type: String, trim: true }],
};

const promptVariableSchema = new Schema<IPromptVariable>(
  promptVariableSchemaDefinition as any,
  { _id: false },
);

const promptMessageSchema = new Schema<IPromptMessage>(
  {
    role: {
      type: String,
      enum: ["system", "user", "assistant"],
      required: true,
    },
    content: { type: String, required: true },
  },
  { _id: false },
);

const promptLibrarySchema = new Schema<IPromptLibraryDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: "PromptFolder",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, trim: true, lowercase: true, index: true },
    description: { type: String, default: "", maxlength: 500 },
    category: {
      type: String,
      enum: PROMPT_CATEGORIES,
      default: "general",
      required: true,
      index: true,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    body: { type: String, required: true, maxlength: 20000 },
    messages: [promptMessageSchema],
    variables: [promptVariableSchema],
    visibility: {
      type: String,
      enum: PROMPT_VISIBILITIES,
      default: "organization",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    version: { type: Number, default: 1, min: 1 },
    hash: { type: String, default: "" },
    isLatest: { type: Boolean, default: true, index: true },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "PromptLibrary",
      default: null,
    },
    isFavorite: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false, index: true },
    isTemplate: { type: Boolean, default: false, index: true },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Indexes
promptLibrarySchema.index({ workspaceId: 1, isLatest: 1, isArchived: 1 });
promptLibrarySchema.index({ projectId: 1, isLatest: 1, isArchived: 1 });
promptLibrarySchema.index({ category: 1, visibility: 1, isLatest: 1 });
promptLibrarySchema.index({ tags: 1 });
promptLibrarySchema.index({
  name: "text",
  description: "text",
  body: "text",
  tags: "text",
});

export default model<IPromptLibraryDocument>(
  "PromptLibrary",
  promptLibrarySchema,
);
