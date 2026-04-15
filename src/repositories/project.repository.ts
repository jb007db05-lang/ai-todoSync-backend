import mongoose from "mongoose";

import ProjectModel, { IProjectDocument } from "../models/project.model.js";
import TaskModel from "../models/task.model.js";
import EpicModel from "../models/epic.model.js";
import NoteModel from "../models/note.model.js";

export interface CreateProjectPayload {
  userId: string;
  name: string;
  description?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
}

export const createProject = async (
  payload: CreateProjectPayload,
): Promise<IProjectDocument> => ProjectModel.create(payload);

export interface ProjectQueryParams {
  userId: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export const getProjectsByUser = async (
  params: ProjectQueryParams,
): Promise<IProjectDocument[]> => {
  const query: any = { userId: params.userId };

  if (params.search) {
    query.name = { $regex: params.search, $options: "i" };
  }

  return ProjectModel.find(query)
    .sort({ name: 1, _id: 1 })
    .skip(params.skip || 0)
    .limit(params.limit || 0)
    .exec();
};

export const countProjectsByUser = async (
  userId: string,
  search?: string,
): Promise<number> => {
  const query: any = { userId };

  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  return ProjectModel.countDocuments(query).exec();
};

export const getProjectById = async (
  projectId: string,
): Promise<IProjectDocument | null> => ProjectModel.findById(projectId).exec();

export const getProjectByIdAndUser = async (
  projectId: string,
  userId: string,
): Promise<IProjectDocument | null> =>
  ProjectModel.findOne({ _id: projectId, userId }).exec();

export const getProjectByName = async (
  userId: string,
  name: string,
): Promise<IProjectDocument | null> =>
  ProjectModel.findOne({ userId, name }).exec();

export const updateProject = async (
  projectId: string,
  userId: string,
  updates: UpdateProjectPayload,
): Promise<IProjectDocument | null> =>
  ProjectModel.findOneAndUpdate({ _id: projectId, userId }, updates, {
    new: true,
  }).exec();

export const deleteProject = async (
  projectId: string,
  userId: string,
): Promise<IProjectDocument | null> =>
  ProjectModel.findOneAndDelete({ _id: projectId, userId }).exec();

export const deleteTasksByProject = async (
  userId: string,
  projectId: string,
): Promise<void> => {
  await TaskModel.deleteMany({ userId, projectId }).exec();
};

export const deleteProjectWithRelations = async (
  userId: string,
  projectId: string,
): Promise<IProjectDocument | null> => {
  const session = await mongoose.startSession();

  try {
    let deletedProject: IProjectDocument | null = null;

    await session.withTransaction(async () => {
      deletedProject = await ProjectModel.findOneAndDelete(
        { _id: projectId, userId },
        { session },
      ).exec();

      if (deletedProject == null) {
        return;
      }

      await TaskModel.deleteMany({ userId, projectId }, { session }).exec();
      await EpicModel.deleteMany({ projectId }, { session }).exec();
      await NoteModel.deleteMany({ projectId }, { session }).exec();
    });

    return deletedProject;
  } finally {
    await session.endSession();
  }
};

export const deleteProjectsWithRelations = async (
  userId: string,
  projectIds: string[],
): Promise<number> => {
  const session = await mongoose.startSession();
  let deletedCount = 0;

  try {
    await session.withTransaction(async () => {
      const result = await ProjectModel.deleteMany(
        { _id: { $in: projectIds }, userId },
        { session },
      ).exec();

      deletedCount = result.deletedCount;

      if (deletedCount === 0) {
        return;
      }

      await TaskModel.deleteMany(
        { userId, projectId: { $in: projectIds } },
        { session },
      ).exec();
      await EpicModel.deleteMany(
        { projectId: { $in: projectIds } },
        { session },
      ).exec();
      await NoteModel.deleteMany(
        { projectId: { $in: projectIds } },
        { session },
      ).exec();
    });

    return deletedCount;
  } finally {
    await session.endSession();
  }
};
