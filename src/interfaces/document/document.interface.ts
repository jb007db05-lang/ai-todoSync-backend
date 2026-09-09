import type { Types } from "mongoose";

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
