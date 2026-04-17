import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type TaskWorkflowStatus =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "BLOCKED"
  | "DONE";
export type TaskStatus = TaskWorkflowStatus | "rolled_over";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

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
  isBlocked: boolean;
  blockedByTaskId?: Types.ObjectId | string | null;
  order: number;
  rolledOver: boolean;
  rolloverCount: number;
  source?: string;
  projectId?: Types.ObjectId | string | null;
  epicId?: Types.ObjectId | string | null;
  assignedTo: Types.ObjectId | string;
  assignedBy?: Types.ObjectId | string | null;
  assignedAt?: Date;
  subtasks?: ISubtask[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITaskDocument extends ITask, Document {}

const subtaskSchema = new Schema<ISubtask>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    note: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"],
      default: "TODO",
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true },
);

const taskSchema = new Schema<ITaskDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    note: {
      type: String,
      default: "",
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    status: {
      type: String,
      enum: [
        "BACKLOG",
        "TODO",
        "IN_PROGRESS",
        "IN_REVIEW",
        "BLOCKED",
        "DONE",
        "rolled_over",
      ],
      default: "TODO",
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedByTaskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
    },
    rolledOver: {
      type: Boolean,
      default: false,
    },
    rolloverCount: {
      type: Number,
      default: 0,
    },
    source: {
      type: String,
      default: "manual",
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    epicId: {
      type: Schema.Types.ObjectId,
      ref: "Epic",
      default: null,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    subtasks: {
      type: [subtaskSchema],
      default: [],
    },
  },
  { timestamps: true },
);

const TaskModel = model<ITaskDocument>("Task", taskSchema);

export default TaskModel;
