import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface INote {
  entityType: "project" | "epic";
  projectId: Types.ObjectId | string;
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
      required: true,
      enum: ["project", "epic"],
    },
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Project",
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
