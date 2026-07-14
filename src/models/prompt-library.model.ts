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

export interface IPromptVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required: boolean;
}

export interface IPromptLibrary {
  projectId?: Types.ObjectId | string | null; // null = global/org-level
  name: string;
  description: string;
  category: PromptCategory;
  tags: string[];
  body: string; // prompt text with {{variable}} placeholders
  variables: IPromptVariable[];
  visibility: PromptVisibility;
  createdBy: Types.ObjectId | string;
  version: number;
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
  description: { type: String, default: "" },
  defaultValue: { type: String, default: "" },
  required: { type: Boolean, default: false },
};

const promptVariableSchema = new Schema<IPromptVariable>(
  promptVariableSchemaDefinition as any,
  { _id: false },
);

const promptLibrarySchema = new Schema<IPromptLibraryDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
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
    variables: [promptVariableSchema],
    visibility: {
      type: String,
      enum: PROMPT_VISIBILITIES,
      default: "project",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    version: { type: Number, default: 1, min: 1 },
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

// Compound indexes for search
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
