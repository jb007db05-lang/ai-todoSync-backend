import mongoose, { type Document, Schema } from "mongoose";

export type EntityType = "project" | "epic" | "task" | "subtask" | "note";
export type ActionType =
  | "created"
  | "updated"
  | "deleted"
  | "assigned"
  | "status_changed"
  | "member_added"
  | "member_removed";

export interface IFieldChange {
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface IActivityLog {
  projectId: string;
  entityType: EntityType;
  entityId: string;
  entityName?: string;
  action: ActionType;
  userId: string;
  userName: string;
  changes: IFieldChange[];
  description: string;
  createdAt: Date;
}

export interface IActivityLogDocument extends IActivityLog, Document {}

const fieldChangeSchema = new Schema<IFieldChange>(
  {
    field: { type: String, required: true },
    oldValue: { type: String },
    newValue: { type: String },
  },
  { _id: false },
);

const activityLogSchema = new Schema<IActivityLogDocument>(
  {
    projectId: { type: String, required: true, index: true },
    entityType: {
      type: String,
      required: true,
      enum: ["project", "epic", "task", "subtask", "note"],
    },
    entityId: { type: String, required: true },
    entityName: { type: String },
    action: {
      type: String,
      required: true,
      enum: [
        "created",
        "updated",
        "deleted",
        "assigned",
        "status_changed",
        "member_added",
        "member_removed",
      ],
    },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    changes: { type: [fieldChangeSchema], default: [] },
    description: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

activityLogSchema.index({ projectId: 1, createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1 });

const ActivityLogModel = mongoose.model<IActivityLogDocument>(
  "ActivityLog",
  activityLogSchema,
);

export default ActivityLogModel;
