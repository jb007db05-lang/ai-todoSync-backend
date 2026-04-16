import type { ClientSession } from "mongoose";

import TaskModel, { ISubtask, ITaskDocument } from "../models/task.model.js";
import type { TaskStatus } from "../models/task.model.js";

export type TaskDocumentWithAssignee = ITaskDocument;

export interface CreateTaskPayload {
  userId: string;
  title: string;
  description?: string;
  note?: string;
  date: string;
  status?: TaskStatus;
  source?: string;
  projectId?: string | null;
  epicId?: string | null;
  subtasks?: ISubtask[];
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  note?: string;
  date?: string;
  status?: TaskStatus;
  projectId?: string | null;
  epicId?: string | null;
  subtasks?: ISubtask[];
}

const subtaskAssigneePopulation = {
  path: "subtasks.assignedToUserId",
  select: "email name",
};

export const createTask = async (
  payload: CreateTaskPayload,
): Promise<TaskDocumentWithAssignee> =>
  TaskModel.create(payload).then((task) =>
    task.populate(subtaskAssigneePopulation),
  );

export const getTasksByUser = async (
  userId: string,
  projectIds: string[],
): Promise<TaskDocumentWithAssignee[]> =>
  TaskModel.find({
    $or: [{ userId }, { projectId: { $in: projectIds } }],
  })
    .populate(subtaskAssigneePopulation)
    .sort({ date: 1, _id: 1 })
    .exec();

export const updateTask = async (
  taskId: string,
  updates: UpdateTaskPayload,
): Promise<TaskDocumentWithAssignee | null> =>
  TaskModel.findByIdAndUpdate(taskId, updates, {
    new: true,
  })
    .populate(subtaskAssigneePopulation)
    .exec();

export const getTaskByIdAndUser = async (
  taskId: string,
  userId: string,
  projectIds: string[],
): Promise<TaskDocumentWithAssignee | null> =>
  TaskModel.findOne({
    _id: taskId,
    $or: [{ userId }, { projectId: { $in: projectIds } }],
  })
    .populate(subtaskAssigneePopulation)
    .exec();

export const getTaskById = async (
  taskId: string,
): Promise<TaskDocumentWithAssignee | null> =>
  TaskModel.findById(taskId).populate(subtaskAssigneePopulation).exec();

export const deleteTask = async (taskId: string): Promise<boolean> => {
  const result = await TaskModel.deleteOne({ _id: taskId }).exec();
  return result.deletedCount !== undefined && result.deletedCount > 0;
};

export const getTasksByDate = async (
  userId: string,
  projectIds: string[],
  date: string,
): Promise<TaskDocumentWithAssignee[]> =>
  TaskModel.find({
    date,
    $or: [{ userId }, { projectId: { $in: projectIds } }],
  })
    .populate(subtaskAssigneePopulation)
    .sort({ status: 1, _id: 1 })
    .exec();

export const getPendingTasksByDate = async (
  date: string,
): Promise<ITaskDocument[]> =>
  TaskModel.find({ date, status: "pending" }).exec();

export const markTasksRolledOver = async (taskIds: string[]): Promise<void> => {
  if (!taskIds.length) {
    return;
  }

  await TaskModel.updateMany(
    { _id: { $in: taskIds } },
    { status: "rolled_over", rolledOver: true },
  ).exec();
};

export const clearTaskAssignmentsForUser = async (
  projectId: string,
  userId: string,
  session?: ClientSession,
): Promise<void> => {
  await TaskModel.updateMany(
    { projectId, assignedToUserId: userId },
    { $set: { assignedToUserId: null } },
    { session },
  ).exec();
};
