import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export interface IComment {
  taskId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  content: string;
  mentions: (Types.ObjectId | string)[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICommentDocument extends IComment, Document {}

const commentSchema = new Schema<ICommentDocument>(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    mentions: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true },
);

const CommentModel = model<ICommentDocument>("Comment", commentSchema);

export default CommentModel;
