import TaskModel, {
  ISubtask,
  ITaskDocument,
  TaskStatus,
} from "../models/task.model.js";

export interface SyncTaskInsertPayload {
  userId: string;
  title: string;
  description?: string;
  note?: string;
  date: string;
  status?: TaskStatus;
  source?: string;
  projectId?: string | null;
  subtasks?: ISubtask[];
  rolledOver?: boolean;
  rolloverCount?: number;
}

export const bulkInsertTasks = async (
  payloads: SyncTaskInsertPayload[],
): Promise<ITaskDocument[]> =>
  TaskModel.insertMany(payloads, { ordered: false });
