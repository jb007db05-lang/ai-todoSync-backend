import mongoose from "mongoose";
import type { ClientSession } from "mongoose";

import EpicModel, {
  IEpicDocument,
  type EpicStatus,
} from "../models/epic.model.js";
import TaskModel from "../models/task.model.js";

export interface CreateEpicPayload {
  projectId: string;
  name: string;
  description?: string;
  status?: EpicStatus;
  order: number;
}

export interface UpdateEpicPayload {
  name?: string;
  description?: string;
  status?: EpicStatus;
}

export interface ReorderEpicPayload {
  id: string;
  order: number;
}

export const createEpic = async (
  payload: CreateEpicPayload,
): Promise<IEpicDocument> => EpicModel.create(payload);

export const getEpicsByProject = async (
  projectId: string,
): Promise<IEpicDocument[]> =>
  EpicModel.find({ projectId }).sort({ order: 1, _id: 1 }).exec();

export const getEpicById = async (
  epicId: string,
): Promise<IEpicDocument | null> => EpicModel.findById(epicId).exec();

export const getEpicByIdAndProject = async (
  epicId: string,
  projectId: string,
): Promise<IEpicDocument | null> =>
  EpicModel.findOne({ _id: epicId, projectId }).exec();

export const updateEpic = async (
  epicId: string,
  projectId: string,
  updates: UpdateEpicPayload,
): Promise<IEpicDocument | null> =>
  EpicModel.findOneAndUpdate({ _id: epicId, projectId }, updates, {
    new: true,
  }).exec();

export const getNextEpicOrder = async (projectId: string): Promise<number> => {
  const latestEpic = await EpicModel.findOne({ projectId })
    .sort({ order: -1, _id: -1 })
    .select({ order: 1 })
    .lean()
    .exec();

  return latestEpic == null ? 0 : latestEpic.order + 1;
};

const withSession = async <T>(
  callback: (session: ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession();

  try {
    let result: T | undefined;

    await session.withTransaction(async () => {
      result = await callback(session);
    });

    return result as T;
  } finally {
    await session.endSession();
  }
};

export const deleteEpic = async (
  epicId: string,
  projectId: string,
): Promise<IEpicDocument | null> =>
  withSession(async (session) => {
    await TaskModel.updateMany(
      { projectId, epicId },
      { $set: { epicId: null } },
      { session },
    ).exec();

    const deletedEpic = await EpicModel.findOneAndDelete(
      { _id: epicId, projectId },
      { session },
    ).exec();

    if (deletedEpic == null) {
      return null;
    }

    const remainingEpics = await EpicModel.find({ projectId })
      .sort({ order: 1, _id: 1 })
      .session(session)
      .exec();

    for (const [index, epic] of remainingEpics.entries()) {
      if (epic.order !== index) {
        epic.order = index;
        await epic.save({ session });
      }
    }

    return deletedEpic;
  });

export const reorderEpics = async (
  projectId: string,
  payload: ReorderEpicPayload[],
): Promise<IEpicDocument[]> =>
  withSession(async (session) => {
    const orderOffset = payload.length + 1;

    for (const item of payload) {
      await EpicModel.updateOne(
        { _id: item.id, projectId },
        { $set: { order: item.order + orderOffset } },
        { session },
      ).exec();
    }

    for (const item of payload) {
      await EpicModel.updateOne(
        { _id: item.id, projectId },
        { $set: { order: item.order } },
        { session },
      ).exec();
    }

    return EpicModel.find({ projectId })
      .sort({ order: 1, _id: 1 })
      .session(session)
      .exec();
  });

export const deleteEpicsByProject = async (
  projectId: string,
): Promise<void> => {
  await EpicModel.deleteMany({ projectId }).exec();
};
