import mongoose from "mongoose";
import type { ClientSession } from "mongoose";

import ProjectModel, { IProjectDocument } from "../models/project.model.js";
import TaskModel from "../models/task.model.js";
import EpicModel from "../models/epic.model.js";
import NoteModel from "../models/note.model.js";
import ProjectMemberModel from "../models/project-member.model.js";
import { deleteProjectMembershipsByProject } from "./project-member.repository.js";
import {
  andRefMatches,
  buildRefInMatch,
  buildRefMatch,
} from "../utils/mongo-ref.js";

export const projectPopulateOptions = [
  { path: "userId", select: "email name firstName lastName" },
];

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
  session?: ClientSession,
): Promise<IProjectDocument> =>
  ProjectModel.create([{ ...payload }], { session }).then(
    ([project]) => project,
  );

export interface ProjectQueryParams {
  userId: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export const getProjectsByUser = async (
  params: ProjectQueryParams,
): Promise<IProjectDocument[]> => {
  const memberships = await ProjectMemberModel.find(
    buildRefMatch("userId", params.userId),
  )
    .select({ projectId: 1 })
    .lean()
    .exec();
  const projectIds = memberships.map((membership) =>
    membership.projectId.toString(),
  );

  if (projectIds.length === 0) {
    return [];
  }

  const query: Record<string, unknown> = buildRefInMatch("_id", projectIds);

  if (params.search) {
    query.name = { $regex: params.search, $options: "i" };
  }

  return ProjectModel.find(query)
    .populate(projectPopulateOptions)
    .sort({ name: 1, _id: 1 })
    .skip(params.skip || 0)
    .limit(params.limit || 0)
    .exec();
};

export const countProjectsByUser = async (
  userId: string,
  search?: string,
): Promise<number> => {
  const memberships = await ProjectMemberModel.find(
    buildRefMatch("userId", userId),
  )
    .select({ projectId: 1 })
    .lean()
    .exec();
  const projectIds = memberships.map((membership) =>
    membership.projectId.toString(),
  );

  if (projectIds.length === 0) {
    return 0;
  }

  const query: Record<string, unknown> = buildRefInMatch("_id", projectIds);

  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  return ProjectModel.countDocuments(query).exec();
};

export const getProjectById = async (
  projectId: string,
): Promise<IProjectDocument | null> =>
  ProjectModel.findById(projectId).populate(projectPopulateOptions).exec();

export const getProjectByIdAndUser = async (
  projectId: string,
  userId: string,
): Promise<IProjectDocument | null> =>
  ProjectMemberModel.exists({
    ...andRefMatches(
      buildRefMatch("projectId", projectId),
      buildRefMatch("userId", userId),
    ),
  }).then((membership) => {
    if (membership == null) {
      return null;
    }

    return ProjectModel.findById(projectId)
      .populate(projectPopulateOptions)
      .exec();
  });

export const getProjectByName = async (
  userId: string,
  name: string,
): Promise<IProjectDocument | null> =>
  ProjectModel.findOne(
    andRefMatches({ name }, buildRefMatch("userId", userId)),
  ).exec();

export const updateProject = async (
  projectId: string,
  updates: UpdateProjectPayload,
): Promise<IProjectDocument | null> =>
  ProjectModel.findByIdAndUpdate(projectId, updates, {
    new: true,
  }).exec();

export const deleteProject = async (
  projectId: string,
): Promise<IProjectDocument | null> =>
  ProjectModel.findByIdAndDelete(projectId).exec();

export const deleteTasksByProject = async (
  userId: string,
  projectId: string,
): Promise<void> => {
  await TaskModel.deleteMany(
    andRefMatches(
      buildRefMatch("userId", userId),
      buildRefMatch("projectId", projectId),
    ),
  ).exec();
};

export const deleteProjectWithRelations = async (
  projectId: string,
): Promise<IProjectDocument | null> => {
  const session = await mongoose.startSession();

  try {
    let deletedProject: IProjectDocument | null = null;

    await session.withTransaction(async () => {
      deletedProject = await ProjectModel.findByIdAndDelete(projectId, {
        session,
      }).exec();

      if (deletedProject == null) {
        return;
      }

      await TaskModel.deleteMany(buildRefMatch("projectId", projectId), {
        session,
      }).exec();
      await EpicModel.deleteMany(buildRefMatch("projectId", projectId), {
        session,
      }).exec();
      await NoteModel.deleteMany(buildRefMatch("projectId", projectId), {
        session,
      }).exec();
      await deleteProjectMembershipsByProject(projectId, session);
    });

    return deletedProject;
  } finally {
    await session.endSession();
  }
};

export const deleteProjectsWithRelations = async (
  projectIds: string[],
): Promise<number> => {
  const session = await mongoose.startSession();
  let deletedCount = 0;

  try {
    await session.withTransaction(async () => {
      const result = await ProjectModel.deleteMany(
        { _id: { $in: projectIds } },
        { session },
      ).exec();

      deletedCount = result.deletedCount;

      if (deletedCount === 0) {
        return;
      }

      await TaskModel.deleteMany(buildRefInMatch("projectId", projectIds), {
        session,
      }).exec();
      await EpicModel.deleteMany(buildRefInMatch("projectId", projectIds), {
        session,
      }).exec();
      await NoteModel.deleteMany(buildRefInMatch("projectId", projectIds), {
        session,
      }).exec();
      await ProjectMemberModel.deleteMany(
        buildRefInMatch("projectId", projectIds),
        { session },
      ).exec();
    });

    return deletedCount;
  } finally {
    await session.endSession();
  }
};
