import WorkspaceMemberModel from "../models/workspace-member.model.js";
import type { WorkspaceRole } from "../models/workspace-member.model.js";
import type { Types } from "mongoose";

export async function findMembership(workspaceId: string, userId: string) {
  return WorkspaceMemberModel.findOne({ workspaceId, userId }).lean();
}

export async function createMembership(data: {
  workspaceId: string | Types.ObjectId;
  userId: string | Types.ObjectId;
  role: WorkspaceRole;
}) {
  return WorkspaceMemberModel.create(data);
}

export async function deleteMembership(workspaceId: string, userId: string) {
  return WorkspaceMemberModel.findOneAndDelete({ workspaceId, userId });
}

export async function updateMembershipRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
) {
  return WorkspaceMemberModel.findOneAndUpdate(
    { workspaceId, userId },
    { role },
    { new: true },
  ).lean();
}

export async function listMembersByWorkspace(workspaceId: string) {
  return WorkspaceMemberModel.find({ workspaceId })
    .populate<{
      userId: { _id: any; name?: string | null; email: string };
    }>("userId", "name email")
    .sort({ joinedAt: 1 })
    .lean();
}

export async function countMembersByWorkspace(workspaceId: string) {
  return WorkspaceMemberModel.countDocuments({ workspaceId });
}

export async function findMembershipsByUser(userId: string) {
  return WorkspaceMemberModel.find({ userId }).lean();
}

export async function countOwnersByWorkspace(workspaceId: string) {
  return WorkspaceMemberModel.countDocuments({ workspaceId, role: "OWNER" });
}
