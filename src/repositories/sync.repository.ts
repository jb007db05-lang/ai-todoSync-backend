import TaskModel, { ITaskDocument, TaskStatus } from '../models/task.model.js';

export interface SyncTaskInsertPayload {
  userId: string;
  title: string;
  description?: string;
  date: string;
  status?: TaskStatus;
  source?: string;
  rolledOver?: boolean;
  rolloverCount?: number;
}

export const bulkInsertTasks = async (
  payloads: SyncTaskInsertPayload[]
): Promise<ITaskDocument[]> => TaskModel.insertMany(payloads, { ordered: false });
