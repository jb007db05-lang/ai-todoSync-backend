import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type NoteParentType = "project" | "epic" | "task" | "subtask";

export interface INote {
  entityType: "project" | "epic";
  parentType: NoteParentType;
  parentId: Types.ObjectId | string;
  projectId?: Types.ObjectId | string | null;
  epicId?: Types.ObjectId | string | null;
  title: string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface INoteDocument extends INote, Document {}

const noteSchema = new Schema<INoteDocument>(
  {
    entityType: {
      type: String,
      enum: ["project", "epic"],
      default: undefined,
    },
    parentType: {
      type: String,
      required: true,
      enum: ["project", "epic", "task", "subtask"],
    },
    parentId: {
      type: Schema.Types.Mixed,
      required: true,
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

noteSchema.index({ parentType: 1, parentId: 1, updatedAt: -1, _id: -1 });
noteSchema.index({ projectId: 1, updatedAt: -1, _id: -1 });
noteSchema.index({
  entityType: 1,
  projectId: 1,
  epicId: 1,
  updatedAt: -1,
  _id: -1,
});

const NoteModel = model<INoteDocument>("Note", noteSchema);

export default NoteModel;
