import WorkspaceModel from "../models/workspace.model.js";
import type {
  IWorkspaceDocument,
  IWorkspaceSettings,
} from "../models/workspace.model.js";
import type { Types } from "mongoose";

export async function findWorkspaceById(id: string) {
  return WorkspaceModel.findById(id).lean();
}

export async function findWorkspaceBySlug(slug: string) {
  return WorkspaceModel.findOne({ slug }).lean();
}

export async function createWorkspace(data: {
  name: string;
  slug: string;
  ownerId: string | Types.ObjectId;
  settings?: IWorkspaceSettings;
}) {
  return WorkspaceModel.create(data);
}

export async function updateWorkspaceById(
  id: string,
  updates: Partial<Pick<IWorkspaceDocument, "name" | "slug" | "settings">>,
) {
  return WorkspaceModel.findByIdAndUpdate(id, updates, { new: true }).lean();
}

export async function deleteWorkspaceById(id: string) {
  return WorkspaceModel.findByIdAndDelete(id);
}

export async function findWorkspacesByIds(ids: (string | Types.ObjectId)[]) {
  return WorkspaceModel.find({ _id: { $in: ids } })
    .sort({ createdAt: 1 })
    .lean();
}
