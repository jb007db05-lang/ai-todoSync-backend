import TaskModel, { ITaskDocument } from '../models/task.model.js';
import type { TaskStatus } from '../models/task.model.js';

export interface CreateTaskPayload {
  userId: string;
  title: string;
  description?: string;
  date: string;
  status?: TaskStatus;
  source?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  date?: string;
  status?: TaskStatus;
}

export const createTask = async (payload: CreateTaskPayload): Promise<ITaskDocument> => TaskModel.create(payload);

export const getTasksByUser = async (userId: string): Promise<ITaskDocument[]> =>
  TaskModel.find({ userId }).sort({ date: 1, _id: 1 }).exec();

export const updateTask = async (
  taskId: string,
  userId: string,
  updates: UpdateTaskPayload
): Promise<ITaskDocument | null> =>
  TaskModel.findOneAndUpdate({ _id: taskId, userId }, updates, { new: true }).exec();

export const deleteTask = async (taskId: string, userId: string): Promise<boolean> => {
  const result = await TaskModel.deleteOne({ _id: taskId, userId }).exec();
  return result.deletedCount !== undefined && result.deletedCount > 0;
};

export const getTasksByDate = async (userId: string, date: string): Promise<ITaskDocument[]> =>
  TaskModel.find({ userId, date }).sort({ status: 1, _id: 1 }).exec();

export const getPendingTasksByDate = async (date: string): Promise<ITaskDocument[]> =>
  TaskModel.find({ date, status: 'pending' }).exec();

export const markTasksRolledOver = async (taskIds: string[]): Promise<void> => {
  if (!taskIds.length) {
    return;
  }

  await TaskModel.updateMany({ _id: { $in: taskIds } }, { status: 'rolled_over', rolledOver: true }).exec();
};
