import type { Types } from "mongoose";

export type EpicStatus = "planned" | "active" | "completed" | "archived";

export interface IEpic {
  name: string;
  description?: string;
  projectId: Types.ObjectId | string;
  status?: EpicStatus;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}
