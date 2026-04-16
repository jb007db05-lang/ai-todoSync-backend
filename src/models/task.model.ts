import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type TaskWorkflowStatus =
  | "pending"
  | "in_progress"
  | "in_review"
  | "completed";
export type TaskStatus = TaskWorkflowStatus | "rolled_over";

export interface ISubtask {
  title: string;
  description?: string;
  note?: string;
  status: TaskWorkflowStatus;
  completed: boolean;
  completedAt?: Date | null;
}

export interface ITask {
  userId: Types.ObjectId | string;
  title: string;
  description?: string;
  note?: string;
  date: string;
  status: TaskStatus;
  rolledOver: boolean;
  rolloverCount: number;
  source?: string;
  projectId?: Types.ObjectId | string | null;
  epicId?: Types.ObjectId | string | null;
  assignedToUserId?: Types.ObjectId | string | null;
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
      enum: ["pending", "in_progress", "in_review", "completed"],
      default: "pending",
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
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
      enum: ["pending", "in_progress", "in_review", "completed", "rolled_over"],
      default: "pending",
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
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
