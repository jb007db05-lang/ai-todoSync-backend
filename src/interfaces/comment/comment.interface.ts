import type { Types } from "mongoose";

export interface IComment {
  taskId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  content: string;
  mentions: (Types.ObjectId | string)[];
  createdAt?: Date;
  updatedAt?: Date;
}
