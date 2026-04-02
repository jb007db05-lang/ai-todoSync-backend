import ProjectModel, { IProjectDocument } from "../models/project.model.js";
import TaskModel from "../models/task.model.js";

export interface CreateProjectPayload {
  userId: string;
  name: string;
}

export interface UpdateProjectPayload {
  name?: string;
}

export const createProject = async (
  payload: CreateProjectPayload,
): Promise<IProjectDocument> => ProjectModel.create(payload);

export const getProjectsByUser = async (
  userId: string,
): Promise<IProjectDocument[]> =>
  ProjectModel.find({ userId }).sort({ name: 1, _id: 1 }).exec();

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
