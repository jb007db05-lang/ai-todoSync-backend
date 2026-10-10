import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

/** Hours one member logged on one task on one day. */
export interface ITimeEntry {
  workspaceId: Types.ObjectId | string;
  projectId: Types.ObjectId | string;
  taskId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  hours: number;
  /** Calendar day the work was done (stored as UTC midnight). */
  entryDate: Date;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITimeEntryDocument extends ITimeEntry, Document {}

const timeEntrySchema = new Schema<ITimeEntryDocument>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hours: { type: Number, required: true, min: 0.01, max: 24 },
    entryDate: { type: Date, required: true },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { timestamps: true },
);

timeEntrySchema.index({ projectId: 1, entryDate: -1 });
timeEntrySchema.index({ projectId: 1, userId: 1, entryDate: -1 });
timeEntrySchema.index({ projectId: 1, taskId: 1 });
timeEntrySchema.index({ workspaceId: 1, entryDate: -1 });

const TimeEntryModel = model<ITimeEntryDocument>("TimeEntry", timeEntrySchema);

export default TimeEntryModel;
