import WorkspaceModel, {
  IWorkspaceDocument,
} from "../../../modules/workspace/models/workspace.model.js";
import WorkspaceMemberModel, {
  WorkspaceRole,
} from "../../../modules/workspace/models/workspace-member.model.js";
import UserModel from "../../auth/models/user.model.js";
import ProjectModel from "../../project/models/project.model.js";
import { AppError } from "../../../utils/app-error.js";
import { countOwnersByWorkspace } from "../repositories/workspace-member.repository.js";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/^-+$/, "workspace");
}

class WorkspaceService {
  public async assertMembership(
    userId: string,
    workspaceId: string,
    allowedRoles?: WorkspaceRole[],
  ) {
    const member = await WorkspaceMemberModel.findOne({
      workspaceId,
      userId,
    }).lean();

    if (!member) {
      throw new AppError(403, "Access denied to workspace", "FORBIDDEN");
    }

    if (allowedRoles && !allowedRoles.includes(member.role)) {
      throw new AppError(
        403,
        `Role '${member.role}' does not have sufficient permission`,
        "FORBIDDEN",
      );
    }

    const workspace = await WorkspaceModel.findById(workspaceId).lean();
    if (!workspace) {
      throw new AppError(404, "Workspace not found", "NOT_FOUND");
    }

    return { workspace, member };
  }

  public async getOrCreateDefaultWorkspace(userId: string) {
    const existingMember = await WorkspaceMemberModel.findOne({ userId })
      .sort({ createdAt: 1 })
      .lean();

    if (existingMember) {
      const workspace = await WorkspaceModel.findById(
        existingMember.workspaceId,
      ).lean();
      if (workspace) return workspace;
    }

    const user = await UserModel.findById(userId).lean();
    const name = user?.name ? `${user.name}'s Workspace` : "Personal Workspace";
    let baseSlug = slugify(name) || `workspace-${userId.slice(-4)}`;
    let slug = baseSlug;
    let count = 1;
    while (await WorkspaceModel.findOne({ slug }).lean()) {
      slug = `${baseSlug}-${count++}`;
    }

    const workspace = await WorkspaceModel.create({
      name,
      slug,
      ownerId: userId,
    });

    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId,
      role: "OWNER",
    });

    return workspace.toObject();
  }

  public async createWorkspace(
    userId: string,
    payload: { name: string; slug?: string },
  ) {
    if (!payload.name?.trim()) {
      throw new AppError(400, "Workspace name is required", "BAD_REQUEST");
    }

    let baseSlug = slugify(payload.slug || payload.name);
    let slug = baseSlug;
    let count = 1;
    while (await WorkspaceModel.findOne({ slug }).lean()) {
      slug = `${baseSlug}-${count++}`;
    }

    const workspace = await WorkspaceModel.create({
      name: payload.name.trim(),
      slug,
      ownerId: userId,
    });

    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId,
      role: "OWNER",
    });

    return workspace.toObject();
  }

  public async listUserWorkspaces(userId: string) {
    const memberships = await WorkspaceMemberModel.find({ userId }).lean();
    const workspaceIds = memberships.map((m) => m.workspaceId);

    if (workspaceIds.length === 0) {
      // Auto-initialize default workspace if none
      const defaultWs = await this.getOrCreateDefaultWorkspace(userId);
      workspaceIds.push(defaultWs._id);
    }

    const workspaces = await WorkspaceModel.find({ _id: { $in: workspaceIds } })
      .sort({ createdAt: 1 })
      .lean();

    return Promise.all(
      workspaces.map(async (ws) => {
        const memberCount = await WorkspaceMemberModel.countDocuments({
          workspaceId: ws._id,
        });
        const projectCount = await ProjectModel.countDocuments({
          workspaceId: ws._id,
        });
        const member = memberships.find(
          (m) => m.workspaceId.toString() === ws._id.toString(),
        );

        return {
          id: ws._id.toString(),
          name: ws.name,
          slug: ws.slug,
          ownerId: ws.ownerId.toString(),
          role: member?.role || "MEMBER",
          memberCount,
          projectCount,
          createdAt: ws.createdAt,
        };
      }),
    );
  }

  public async getWorkspaceDetails(userId: string, workspaceId: string) {
    const { workspace, member } = await this.assertMembership(
      userId,
      workspaceId,
    );

    const members = await WorkspaceMemberModel.find({ workspaceId })
      .populate<{
        userId: { _id: any; name?: string; email: string };
      }>("userId", "name email")
      .lean();

    const projects = await ProjectModel.find({
      workspaceId,
      isArchived: { $ne: true },
    })
      .sort({ updatedAt: -1 })
      .lean();

    return {
      id: workspace._id.toString(),
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId.toString(),
      currentUserRole: member.role,
      settings: workspace.settings,
      createdAt: workspace.createdAt,
      members: members.map((m) => ({
        id: m._id.toString(),
        userId: m.userId?._id?.toString() ?? "",
        name: m.userId?.name || "Unknown",
        email: m.userId?.email || "",
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      projects: projects.map((p) => ({
        id: p._id.toString(),
        name: p.name,
        description: p.description,
        icon: p.icon || "folder",
        color: p.color || "#3B82F6",
        status: p.status || "ACTIVE",
        priority: p.priority || "MEDIUM",
        startDate: p.startDate,
        targetDate: p.targetDate,
      })),
    };
  }

  public async updateWorkspace(
    userId: string,
    workspaceId: string,
    payload: { name?: string; slug?: string; settings?: any },
  ) {
    await this.assertMembership(userId, workspaceId, ["OWNER", "ADMIN"]);

    const updates: Partial<IWorkspaceDocument> = {};
    if (payload.name?.trim()) {
      updates.name = payload.name.trim();
    }
    if (payload.slug?.trim()) {
      const candidateSlug = payload.slug.trim();
      const existing = await WorkspaceModel.findOne({
        slug: candidateSlug,
      }).lean();
      if (existing && existing._id.toString() !== workspaceId) {
        throw new AppError(409, "Workspace slug is already taken", "CONFLICT");
      }
      updates.slug = candidateSlug;
    }
    if (payload.settings) {
      updates.settings = payload.settings;
    }

    const updated = await WorkspaceModel.findByIdAndUpdate(
      workspaceId,
      updates,
      {
        new: true,
      },
    ).lean();

    if (!updated) {
      throw new AppError(404, "Workspace not found", "NOT_FOUND");
    }

    return updated;
  }

  public async inviteMember(
    userId: string,
    workspaceId: string,
    payload: { email: string; role?: WorkspaceRole },
  ) {
    await this.assertMembership(userId, workspaceId, ["OWNER", "ADMIN"]);

    if (!payload.email?.trim()) {
      throw new AppError(400, "User email is required", "BAD_REQUEST");
    }

    const targetUser = await UserModel.findOne({
      email: payload.email.trim().toLowerCase(),
    }).lean();

    if (!targetUser) {
      throw new AppError(
        404,
        `User with email ${payload.email} not found`,
        "NOT_FOUND",
      );
    }

    const existingMember = await WorkspaceMemberModel.findOne({
      workspaceId,
      userId: targetUser._id,
    }).lean();

    if (existingMember) {
      throw new AppError(409, "User is already a workspace member", "CONFLICT");
    }

    const role = payload.role || "MEMBER";
    const newMember = await WorkspaceMemberModel.create({
      workspaceId,
      userId: targetUser._id,
      role,
    });

    return {
      id: newMember._id.toString(),
      userId: targetUser._id.toString(),
      name: targetUser.name || "Unknown",
      email: targetUser.email,
      role: newMember.role,
      joinedAt: newMember.joinedAt,
    };
  }

  public async removeMember(
    userId: string,
    workspaceId: string,
    targetUserId: string,
  ) {
    const { workspace } = await this.assertMembership(userId, workspaceId, [
      "OWNER",
      "ADMIN",
    ]);

    if (workspace.ownerId.toString() === targetUserId) {
      throw new AppError(400, "Cannot remove workspace owner", "BAD_REQUEST");
    }

    await WorkspaceMemberModel.findOneAndDelete({
      workspaceId,
      userId: targetUserId,
    });

    return { success: true };
  }

  public async listMembers(userId: string, workspaceId: string) {
    await this.assertMembership(userId, workspaceId);
    const members = await WorkspaceMemberModel.find({ workspaceId })
      .populate<{
        userId: { _id: any; name?: string | null; email: string };
      }>("userId", "name email")
      .sort({ joinedAt: 1 })
      .lean();

    return members.map((m) => ({
      id: m._id.toString(),
      userId: m.userId?._id?.toString() ?? "",
      name: m.userId?.name || "Unknown",
      email: m.userId?.email || "",
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  public async updateMemberRole(
    userId: string,
    workspaceId: string,
    targetUserId: string,
    role: WorkspaceRole,
  ) {
    const { member: actorMember } = await this.assertMembership(
      userId,
      workspaceId,
      ["OWNER", "ADMIN"],
    );

    // Cannot change own role
    if (userId === targetUserId) {
      throw new AppError(400, "Cannot change your own role", "BAD_REQUEST");
    }

    // Only OWNER can grant OWNER role
    if (role === "OWNER" && actorMember.role !== "OWNER") {
      throw new AppError(
        403,
        "Only an OWNER can assign the OWNER role",
        "FORBIDDEN",
      );
    }

    const targetMember = await WorkspaceMemberModel.findOne({
      workspaceId,
      userId: targetUserId,
    }).lean();

    if (!targetMember) {
      throw new AppError(404, "Member not found", "NOT_FOUND");
    }

    // ADMIN cannot change an OWNER's role
    if (targetMember.role === "OWNER" && actorMember.role !== "OWNER") {
      throw new AppError(
        403,
        "Cannot change role of workspace owner",
        "FORBIDDEN",
      );
    }

    // Ensure at least one OWNER remains
    if (targetMember.role === "OWNER" && role !== "OWNER") {
      const ownerCount = await countOwnersByWorkspace(workspaceId);
      if (ownerCount <= 1) {
        throw new AppError(
          400,
          "Workspace must have at least one owner",
          "BAD_REQUEST",
        );
      }
    }

    const updated = await WorkspaceMemberModel.findOneAndUpdate(
      { workspaceId, userId: targetUserId },
      { role },
      { new: true },
    ).lean();

    return updated;
  }

  public async deleteWorkspace(userId: string, workspaceId: string) {
    await this.assertMembership(userId, workspaceId, ["OWNER"]);

    // Delete all members
    await WorkspaceMemberModel.deleteMany({ workspaceId });

    // Soft-disassociate projects (preserve them, just unlink from workspace)
    await ProjectModel.updateMany(
      { workspaceId },
      { $set: { workspaceId: null } },
    );

    // Delete the workspace itself
    await WorkspaceModel.findByIdAndDelete(workspaceId);

    return { success: true };
  }
}

export default new WorkspaceService();
