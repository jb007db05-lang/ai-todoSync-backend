import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type DependencyType = "BLOCKS" | "BLOCKED_BY";

export interface ITaskDependency {
  projectId: Types.ObjectId | string;
  taskId: Types.ObjectId | string;
  dependsOnTaskId: Types.ObjectId | string;
  type: DependencyType;
  createdAt?: Date;
}

export interface ITaskDependencyDocument extends ITaskDependency, Document {}

const taskDependencySchema = new Schema<ITaskDependencyDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Task",
      index: true,
    },
    dependsOnTaskId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Task",
      index: true,
    },
    type: {
      type: String,
      enum: ["BLOCKS", "BLOCKED_BY"],
      default: "BLOCKS",
    },
  },
  { timestamps: true },
);

taskDependencySchema.index({ taskId: 1, dependsOnTaskId: 1 }, { unique: true });

const TaskDependencyModel = model<ITaskDependencyDocument>(
  "TaskDependency",
  taskDependencySchema,
);

export default TaskDependencyModel;
