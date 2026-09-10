import type { Types } from "mongoose";

export type AiPlanningSessionStatus = "ACTIVE" | "ARCHIVED";

export interface IAiPlanningSession {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  createdBy: Types.ObjectId | string;
  title: string;
  status: AiPlanningSessionStatus;
  lastMessageAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AiPlanningMessageRole = "USER" | "ASSISTANT";

export interface IAiPlanningMessage {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  sessionId: Types.ObjectId | string;
  role: AiPlanningMessageRole;
  content: string;
  createdBy?: Types.ObjectId | string | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AiPlanningDraftStatus =
  | "REVIEW"
  | "EXECUTING"
  | "EXECUTED"
  | "REJECTED"
  | "FAILED";

export interface IAiPlanningSubtaskDraft {
  title: string;
  description?: string;
}

export interface IAiPlanningTaskDraft {
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  date: string;
  milestoneIndex: number;
  subtasks: IAiPlanningSubtaskDraft[];
}

export interface IAiPlanningMilestoneDraft {
  name: string;
  description?: string;
}

export interface IAiPlanningPlan {
  documentationTitle: string;
  documentation: string;
  milestones: IAiPlanningMilestoneDraft[];
  tasks: IAiPlanningTaskDraft[];
  [key: string]: any;
}

export interface IAiPlanningArtifactIds {
  noteId?: string;
  epicIds?: string[];
  taskIds?: string[];
}

export interface IAiPlanningDraft {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  sessionId: Types.ObjectId | string;
  requestedBy: Types.ObjectId | string;
  status: AiPlanningDraftStatus;
  plan: IAiPlanningPlan;
  rejectionReason?: string;
  approvedBy?: Types.ObjectId | string | null;
  rejectedBy?: Types.ObjectId | string | null;
  artifacts?: IAiPlanningArtifactIds;
  failureReason?: string;
  executedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
