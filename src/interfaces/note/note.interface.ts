import type { Types } from "mongoose";

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
