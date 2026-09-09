import type { Types } from "mongoose";

export type TaskWorkflowStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "BLOCKED"
  | "DONE";

export type TaskStatus = TaskWorkflowStatus | "rolled_over";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TaskSlaState =
  | "HEALTHY"
  | "NEAR_BREACH"
  | "BREACHED"
  | "PAUSED"
  | "COMPLETED";

export interface ISubtask {
  _id?: any;
  title: string;
  description?: string;
  note?: string;
  status: TaskWorkflowStatus;
  completed: boolean;
  completedAt?: Date | null;
  assignedToUserId?: Types.ObjectId | string | null;
}

export interface ITask {
  userId: Types.ObjectId | string;
  title: string;
  description?: string;
  note?: string;
  date: string;
  status: TaskStatus;
  priority: TaskPriority;
  basePriority: TaskPriority;
  dynamicPriority: TaskPriority;
  urgencyScore: number;
  impactScore: number;
  dependencyWeight: number;
  dynamicPriorityScore: number;
  priorityEscalatedAt?: Date | null;
  priorityEscalationReason?: string;
  isBlocked: boolean;
  blockedByTaskId?: Types.ObjectId | string | null;
  order: number;
  rolledOver: boolean;
  rolloverCount: number;
  source?: string;
  estimatedHours?: number;
  projectId?: Types.ObjectId | string | null;
  epicId?: Types.ObjectId | string | null;
  assignedTo: Types.ObjectId | string;
  assignedBy?: Types.ObjectId | string | null;
  assignedAt?: Date;
  subtasks?: ISubtask[];
  slaResponseDueAt?: Date | null;
  slaResolutionDueAt?: Date | null;
  responseBreached: boolean;
  resolutionBreached: boolean;
  firstResponseAt?: Date | null;
  completedAt?: Date | null;
  slaPausedAt?: Date | null;
  totalPausedDuration: number;
  currentSlaState: TaskSlaState;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITaskDependency {
  taskId: Types.ObjectId | string;
  dependsOnTaskId: Types.ObjectId | string;
  dependencyType: "BLOCKS" | "REQUIRED_FOR";
  createdById: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISlaTarget {
  responseHours: number;
  resolutionHours: number;
}

export interface ISlaConfig {
  workspaceId: Types.ObjectId | string;
  priorityTargets: {
    LOW: ISlaTarget;
    MEDIUM: ISlaTarget;
    HIGH: ISlaTarget;
    CRITICAL: ISlaTarget;
  };
  businessHoursOnly: boolean;
  businessHoursStart: string;
  businessHoursEnd: string;
  workingDays: number[];
  createdAt?: Date;
  updatedAt?: Date;
}
