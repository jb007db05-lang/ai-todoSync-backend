import type { ClientSession } from "mongoose";

import ProjectMemberModel, {
  type IProjectMemberDocument,
  type ProjectRole,
} from "../models/project-member.model.js";
import { andRefMatches, buildRefMatch } from "../utils/mongo-ref.js";
interface ProjectMemberUserShape {
  _id: { toString(): string };
  email: string;
  name: string | null;
}

export interface CreateProjectMemberPayload {
  projectId: string;
  userId: string;
  role: ProjectRole;
}

export interface ProjectMemberWithUser {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt?: Date;
  user: ProjectMemberUserShape;
}

const memberUserProjection = "email name";

export const createProjectMember = async (
  payload: CreateProjectMemberPayload,
  session?: ClientSession,
): Promise<IProjectMemberDocument> =>
  ProjectMemberModel.create([{ ...payload }], { session }).then(
    ([member]) => member,
  );

export const createProjectMembers = async (
  payloads: CreateProjectMemberPayload[],
  session?: ClientSession,
): Promise<IProjectMemberDocument[]> => {
  if (payloads.length === 0) {
    return [];
  }

  return ProjectMemberModel.insertMany(payloads, { session, ordered: true });
};

export const getProjectMembership = async (
  projectId: string,
  userId: string,
): Promise<IProjectMemberDocument | null> =>
  ProjectMemberModel.findOne(
    andRefMatches(
      buildRefMatch("projectId", projectId),
      buildRefMatch("userId", userId),
    ),
  ).exec();

export const getProjectMembershipsByUser = async (
  userId: string,
): Promise<IProjectMemberDocument[]> =>
  ProjectMemberModel.find(buildRefMatch("userId", userId))
    .sort({ createdAt: 1, _id: 1 })
    .exec();

export const getProjectMembers = async (
  projectId: string,
): Promise<ProjectMemberWithUser[]> => {
  const members = await ProjectMemberModel.find(
    buildRefMatch("projectId", projectId),
  )
    .populate("userId", memberUserProjection)
    .sort({ role: 1, createdAt: 1, _id: 1 })
    .exec();

  const mappedMembers: ProjectMemberWithUser[] = [];

  for (const member of members) {
    const user =
      member.userId as unknown as Partial<ProjectMemberUserShape> | null;

    if (user == null || typeof user.email !== "string" || user._id == null) {
      continue;
    }

    mappedMembers.push({
      id: member._id.toString(),
      projectId: member.projectId.toString(),
      userId: user._id.toString(),
      role: member.role,
      createdAt: member.createdAt,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name ?? null,
      },
    });
  }

  return mappedMembers;
};

export const countProjectAdmins = async (projectId: string): Promise<number> =>
  ProjectMemberModel.countDocuments({
    role: "ADMIN",
    ...buildRefMatch("projectId", projectId),
  }).exec();

export const deleteProjectMembership = async (
  projectId: string,
  userId: string,
  session?: ClientSession,
): Promise<IProjectMemberDocument | null> =>
  ProjectMemberModel.findOneAndDelete(
    andRefMatches(
      buildRefMatch("projectId", projectId),
      buildRefMatch("userId", userId),
    ),
    { session },
  ).exec();

export const deleteProjectMembershipsByProject = async (
  projectId: string,
  session?: ClientSession,
): Promise<void> => {
  await ProjectMemberModel.deleteMany(buildRefMatch("projectId", projectId), {
    session,
  }).exec();
};

export const ensureProjectAdminMembership = async (
  projectId: string,
  userId: string,
  session?: ClientSession,
): Promise<void> => {
  await ProjectMemberModel.updateOne(
    andRefMatches(
      buildRefMatch("projectId", projectId),
      buildRefMatch("userId", userId),
    ),
    { $setOnInsert: { role: "ADMIN" } },
    { upsert: true, session },
  ).exec();
};
