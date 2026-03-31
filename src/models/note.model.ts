import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface INote {
  projectId: Types.ObjectId | string;
  title: string;
  content: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface INoteDocument extends INote, Document {}

const noteSchema = new Schema<INoteDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Project'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

noteSchema.index({ projectId: 1, updatedAt: -1, _id: -1 });

const NoteModel = model<INoteDocument>('Note', noteSchema);

export default NoteModel;
