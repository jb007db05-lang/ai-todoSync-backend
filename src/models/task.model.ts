import type { Document, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export type TaskStatus = 'pending' | 'done' | 'rolled_over';

export interface ITask {
  userId: Types.ObjectId | string;
  title: string;
  description?: string;
  date: string;
  status: TaskStatus;
  rolledOver: boolean;
  rolloverCount: number;
  source?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITaskDocument extends ITask, Document {}

const taskSchema = new Schema<ITaskDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    status: {
      type: String,
      enum: ['pending', 'done', 'rolled_over'],
      default: 'pending'
    },
    rolledOver: {
      type: Boolean,
      default: false
    },
    rolloverCount: {
      type: Number,
      default: 0
    },
    source: {
      type: String,
      default: 'manual'
    }
  },
  { timestamps: true }
);

const TaskModel = model<ITaskDocument>('Task', taskSchema);

export default TaskModel;
