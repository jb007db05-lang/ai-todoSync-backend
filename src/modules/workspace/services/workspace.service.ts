import crypto from "crypto";
import { Types } from "mongoose";
import WorkspaceModel, {
  type IWorkspaceDocument,
} from "../models/workspace.model.js";
import WorkspaceMemberModel, {
  type IWorkspaceMember,
  type WorkspaceRole,
} from "../models/workspace-member.model.js";
import InvitationModel from "../models/invitation.model.js";
import UserModel from "../../auth/models/user.model.js";
import ProjectModel from "../../project/models/project.model.js";
import ProjectMemberModel from "../../project/models/project-member.model.js";
import PromptMemberAccessModel from "../../access/prompt-member-access.model.js";
import accessService, {
  type WorkspaceAccess,
} from "../../access/access.service.js";
import EmailService from "../../../shared/services/email.service.js";
import logger from "../../../lib/logger.js";
import {
  PERMISSIONS,
  effectivePermissions,
  isAdminRole,
  parsePermissionPatch,
} from "../../access/permissions.js";
import { AppError } from "../../../utils/app-error.js";

const ROLES: WorkspaceRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "GUEST"];
/** Roles an admin can hand out; ownership is never transferred this way. */
const ASSIGNABLE_ROLES: WorkspaceRole[] = [
  "ADMIN",
  "MANAGER",
  "MEMBER",
  "GUEST",
];

function slugify(text: string): string {
  return (
    text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]+/g, "")
      .replace(/--+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace"
  );
}

type PopulatedMember = Omit<IWorkspaceMember, "userId"> & {
  _id: unknown;
  userId: { _id: unknown; name?: string; email: string } | null;
};

const toMemberDto = (member: PopulatedMember) => ({
  id: String(member._id),
  userId: member.userId ? String(member.userId._id) : "",
  name: member.userId?.name || "Unknown",
  email: member.userId?.email || "",
  role: member.role,
  isAdmin: isAdminRole(member.role),
  permissions: effectivePermissions(member.role, member.permissions),
  joinedAt: member.joinedAt,
});

class WorkspaceService {
  /**
   * Kept for callers that only need "is a member" (prompt services). Prefer
   * accessService for anything permission-based.
   */
  public async assertMembership(
    userId: string,
    workspaceId: string,
    allowedRoles?: WorkspaceRole[],
  ) {
    const access = await accessService.resolve(userId, workspaceId);
    if (allowedRoles && !allowedRoles.includes(access.role)) {
      throw new AppError(
        403,
        `Role '${access.role}' does not have sufficient permission`,
        "FORBIDDEN",
      );
    }
    const workspace = await WorkspaceModel.findById(workspaceId).lean();
    if (!workspace) throw new AppError(404, "Workspace not found", "NOT_FOUND");
    return { workspace, member: access };
  }

  private inFlightDefaultWorkspace = new Map<string, Promise<any>>();

  public async ensureOwnedWorkspace(userId: string, customName?: string) {
    const existingOwned = await WorkspaceModel.findOne({ ownerId: userId })
      .sort({ createdAt: 1 })
      .lean();
    if (existingOwned) {
      await WorkspaceMemberModel.findOneAndUpdate(
        { workspaceId: existingOwned._id, userId },
        {
          $setOnInsert: {
            role: "OWNER",
            permissions: {},
            joinedAt: new Date(),
          },
        },
        { upsert: true, new: true },
      );
      return existingOwned;
    }

    const user = await UserModel.findById(userId).lean();
    const name =
      customName ||
      (user?.name ? `${user.name}'s Workspace` : "Personal Workspace");
    return this.createOwnedWorkspace(userId, name);
  }

  public async getOrCreateDefaultWorkspace(userId: string) {
    const cachedPromise = this.inFlightDefaultWorkspace.get(userId);
    if (cachedPromise) return cachedPromise;

    const promise = (async () => {
      return this.ensureOwnedWorkspace(userId);
    })().finally(() => {
      this.inFlightDefaultWorkspace.delete(userId);
    });

    this.inFlightDefaultWorkspace.set(userId, promise);
    return promise;
  }

  public async createWorkspace(
    userId: string,
    payload: { name?: string; slug?: string },
  ) {
    if (!payload.name?.trim()) {
      throw new AppError(400, "Workspace name is required", "BAD_REQUEST");
    }
    return this.createOwnedWorkspace(userId, payload.name.trim(), payload.slug);
  }

  public async listUserWorkspaces(userId: string) {
    // Every user must have their own workspace created by default
    await this.ensureOwnedWorkspace(userId);

    let memberships = await WorkspaceMemberModel.find({ userId }).lean();

    const seenWorkspaceIds = new Set<string>();
    const uniqueMemberships: typeof memberships = [];
    for (const m of memberships) {
      const wid = String(m.workspaceId);
      if (!seenWorkspaceIds.has(wid)) {
        seenWorkspaceIds.add(wid);
        uniqueMemberships.push(m);
      }
    }
    const workspaceIds = Array.from(seenWorkspaceIds);
    const [workspaces, memberCounts, projectCounts] = await Promise.all([
      WorkspaceModel.find({ _id: { $in: workspaceIds } })
        .sort({ createdAt: 1 })
        .lean(),
      this.countBy(WorkspaceMemberModel, workspaceIds),
      this.countBy(ProjectModel, workspaceIds),
    ]);

    return workspaces.map((ws) => {
      const member = uniqueMemberships.find(
        (m) => String(m.workspaceId) === String(ws._id),
      );
      const isOwner = String(ws.ownerId) === String(userId);
      const role: WorkspaceRole = isOwner
        ? "OWNER"
        : (member?.role as WorkspaceRole) || "MEMBER";
      return {
        id: String(ws._id),
        name: ws.name,
        slug: ws.slug,
        ownerId: String(ws.ownerId),
        role,
        isAdmin: isAdminRole(role),
        permissions: effectivePermissions(role, member?.permissions),
        memberCount: Math.max(1, memberCounts.get(String(ws._id)) ?? 1),
        projectCount: projectCounts.get(String(ws._id)) ?? 0,
        createdAt: ws.createdAt,
      };
    });
  }

  /** Members see only the projects they were given; admins see all. */
  public async getWorkspaceDetails(access: WorkspaceAccess) {
    const workspace = await WorkspaceModel.findById(access.workspaceId).lean();
    if (!workspace) throw new AppError(404, "Workspace not found", "NOT_FOUND");
    const projectIds = await accessService.accessibleProjectIds(access);

    const [members, projects] = await Promise.all([
      this.listMembers(access),
      ProjectModel.find({ _id: { $in: projectIds }, isArchived: { $ne: true } })
        .sort({ updatedAt: -1 })
        .lean(),
    ]);

    return {
      id: String(workspace._id),
      name: workspace.name,
      slug: workspace.slug,
      ownerId: String(workspace.ownerId),
      currentUserRole: access.role,
      currentUserPermissions: access.permissions,
      isAdmin: access.isAdmin,
      settings: workspace.settings,
      createdAt: workspace.createdAt,
      members,
      projects: projects.map((p) => ({
        id: String(p._id),
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

  public async listMembers(access: WorkspaceAccess) {
    const [members, pendingInvitations] = await Promise.all([
      WorkspaceMemberModel.find({
        workspaceId: access.workspaceId,
      })
        .sort({ joinedAt: 1 })
        .populate("userId", "name email")
        .lean(),
      InvitationModel.find({
        workspaceId: access.workspaceId,
        status: "PENDING",
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const activeMembers = (members as unknown as PopulatedMember[]).map(
      toMemberDto,
    );
    const pendingMembers = pendingInvitations.map((inv) => ({
      id: String(inv._id),
      userId: "",
      name: inv.email.split("@")[0],
      email: inv.email,
      role: (inv.role as WorkspaceRole) || "MEMBER",
      isAdmin: isAdminRole((inv.role as WorkspaceRole) || "MEMBER"),
      permissions: effectivePermissions(
        (inv.role as WorkspaceRole) || "MEMBER",
      ),
      joinedAt: inv.createdAt || new Date(),
      isPending: true,
      token: inv.token,
    }));

    return [...activeMembers, ...pendingMembers];
  }

  /** What the caller can do here; drives navigation and button visibility. */
  public myAccess(access: WorkspaceAccess) {
    return {
      workspaceId: access.workspaceId,
      memberId: access.memberId,
      role: access.role,
      isAdmin: access.isAdmin,
      permissions: access.permissions,
    };
  }

  public permissionCatalog() {
    return {
      permissions: PERMISSIONS,
      roles: ROLES,
      assignableRoles: ASSIGNABLE_ROLES,
    };
  }

  public async updateWorkspace(
    access: WorkspaceAccess,
    payload: { name?: string; settings?: Record<string, unknown> },
  ) {
    const updates: Partial<IWorkspaceDocument> = {};
    if (payload.name?.trim()) updates.name = payload.name.trim();
    if (payload.settings && typeof payload.settings === "object") {
      updates.settings = payload.settings;
    }
    const updated = await WorkspaceModel.findByIdAndUpdate(
      access.workspaceId,
      updates,
      { new: true },
    ).lean();
    if (!updated) throw new AppError(404, "Workspace not found", "NOT_FOUND");
    return updated;
  }

  public async inviteMember(
    access: WorkspaceAccess,
    payload: { email?: string; role?: WorkspaceRole },
  ) {
    const email = payload.email?.trim().toLowerCase();
    if (!email)
      throw new AppError(400, "User email is required", "BAD_REQUEST");
    const role = payload.role ?? "MEMBER";
    this.assertAssignableRole(role);

    const targetUser = await UserModel.findOne({ email }).lean();
    if (!targetUser) {
      // Account does not exist yet -> Create pending invitation & send email
      const token = crypto.randomBytes(32).toString("hex");

      let invitation = await InvitationModel.findOne({
        workspaceId: access.workspaceId,
        email,
      });

      if (invitation) {
        if (invitation.status === "ACCEPTED") {
          throw new AppError(
            409,
            "User has already accepted an invitation to this workspace",
            "CONFLICT",
          );
        }
        invitation.token = token;
        invitation.status = "PENDING";
        invitation.role = role;
        invitation.invitedBy = access.userId as unknown as Types.ObjectId;
        await invitation.save();
      } else {
        invitation = await InvitationModel.create({
          workspaceId: access.workspaceId,
          email,
          role,
          token,
          status: "PENDING",
          invitedBy: access.userId,
        });
      }

      // Fetch inviter & workspace info to personalize invitation email
      const workspace = await WorkspaceModel.findById(
        access.workspaceId,
      ).lean();
      const inviter = await UserModel.findById(access.userId).lean();
      const inviterName = inviter?.name || inviter?.email || "Workspace Admin";
      const workspaceName = workspace?.name || "Workspace";

      try {
        await EmailService.sendInvitationEmail(
          email,
          inviterName,
          workspaceName,
          token,
        );
      } catch (mailErr) {
        logger.error("Failed to send invitation email", mailErr as Error);
      }

      return {
        id: String(invitation._id),
        userId: "",
        name: email.split("@")[0],
        email,
        role,
        isAdmin: isAdminRole(role),
        permissions: effectivePermissions(role),
        joinedAt: invitation.createdAt || new Date(),
        isPending: true,
        token,
      };
    }

    const exists = await WorkspaceMemberModel.exists({
      workspaceId: access.workspaceId,
      userId: targetUser._id,
    });
    if (exists) {
      throw new AppError(409, "User is already a workspace member", "CONFLICT");
    }

    const member = await WorkspaceMemberModel.create({
      workspaceId: access.workspaceId,
      userId: targetUser._id,
      role,
    });
    return toMemberDto({
      ...member.toObject(),
      userId: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
      },
    } as PopulatedMember);
  }

  /**
   * Sets individual permission flags for one member. Admins cannot change
   * their own flags (no self-elevation) or the owner's.
   */
  public async updateMemberPermissions(
    access: WorkspaceAccess,
    memberId: string,
    patch: unknown,
  ) {
    const flags = parsePermissionPatch(patch);
    if (!flags) {
      throw new AppError(
        400,
        "permissions must map known permission keys to true or false",
        "INVALID_PERMISSIONS",
      );
    }
    const member = await this.editableMember(access, memberId);
    const next = {
      ...effectivePermissions(member.role, member.permissions),
      ...flags,
    };
    await WorkspaceMemberModel.updateOne(
      { _id: member._id },
      { $set: { permissions: next } },
    );
    return this.memberDto(member._id);
  }

  public async updateMemberRole(
    access: WorkspaceAccess,
    memberId: string,
    role: unknown,
  ) {
    this.assertAssignableRole(role);
    const member = await this.editableMember(access, memberId);
    await WorkspaceMemberModel.updateOne(
      { _id: member._id },
      { $set: { role } },
    );
    return this.memberDto(member._id);
  }

  /**
   * Removes a member and everything that only made sense inside this
   * workspace: their project access and individual prompt grants.
   */
  public async removeMember(access: WorkspaceAccess, memberId: string) {
    if (/^[a-f0-9]{24}$/i.test(memberId)) {
      const pendingInvite = await InvitationModel.findOne({
        _id: memberId,
        workspaceId: access.workspaceId,
        status: "PENDING",
      });
      if (pendingInvite) {
        await InvitationModel.deleteOne({ _id: pendingInvite._id });
        return { success: true };
      }
    }

    const member = await this.editableMember(access, memberId);
    const projectIds = (
      await ProjectModel.find({ workspaceId: access.workspaceId })
        .select({ _id: 1 })
        .lean()
    ).map((p) => p._id);
    await Promise.all([
      ProjectMemberModel.deleteMany({
        userId: member.userId,
        projectId: { $in: projectIds },
      }),
      PromptMemberAccessModel.deleteMany({
        workspaceId: access.workspaceId,
        userId: member.userId,
      }),
      WorkspaceMemberModel.deleteOne({ _id: member._id }),
    ]);
    return { success: true };
  }

  // ------------------------------------------------------------------ helpers

  private async createOwnedWorkspace(
    userId: string,
    name: string,
    requestedSlug?: string,
  ) {
    if (!requestedSlug) {
      const existing = await WorkspaceModel.findOne({ ownerId: userId })
        .sort({ createdAt: 1 })
        .lean();
      if (existing) {
        await WorkspaceMemberModel.findOneAndUpdate(
          { workspaceId: existing._id, userId },
          {
            $setOnInsert: {
              role: "OWNER",
              permissions: {},
              joinedAt: new Date(),
            },
          },
          { upsert: true, new: true },
        );
        return existing;
      }
    }

    const baseSlug = slugify(requestedSlug || name);
    let slug = baseSlug;
    for (let count = 1; await WorkspaceModel.exists({ slug }); count++) {
      slug = `${baseSlug}-${count}`;
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

  /** A member of this workspace the caller is allowed to modify. */
  private async editableMember(access: WorkspaceAccess, memberId: string) {
    const member = /^[a-f0-9]{24}$/i.test(memberId)
      ? await WorkspaceMemberModel.findOne({
          _id: memberId,
          workspaceId: access.workspaceId,
        }).lean()
      : null;
    if (!member) throw new AppError(404, "Member not found", "NOT_FOUND");
    if (String(member._id) === access.memberId) {
      throw new AppError(
        403,
        "You cannot change your own access. Ask another admin.",
        "SELF_EDIT_FORBIDDEN",
      );
    }
    if (member.role === "OWNER") {
      throw new AppError(
        403,
        "The workspace owner cannot be changed.",
        "OWNER_PROTECTED",
      );
    }
    return member;
  }

  private async memberDto(memberId: unknown) {
    const member = await WorkspaceMemberModel.findById(memberId)
      .populate("userId", "name email")
      .lean();
    return toMemberDto(member as unknown as PopulatedMember);
  }

  private assertAssignableRole(role: unknown): asserts role is WorkspaceRole {
    if (!ASSIGNABLE_ROLES.includes(role as WorkspaceRole)) {
      throw new AppError(
        400,
        `role must be one of ${ASSIGNABLE_ROLES.join(", ")}`,
        "INVALID_ROLE",
      );
    }
  }

  private async countBy(
    model: typeof WorkspaceMemberModel | typeof ProjectModel,
    workspaceIds: unknown[],
  ): Promise<Map<string, number>> {
    const objectIds = workspaceIds
      .map((id) => {
        if (id instanceof Types.ObjectId) return id;
        try {
          return new Types.ObjectId(String(id));
        } catch {
          return null;
        }
      })
      .filter((id): id is Types.ObjectId => id !== null);

    const rows = await (model as typeof ProjectModel).aggregate<{
      _id: unknown;
      count: number;
    }>([
      {
        $match: {
          $or: [
            { workspaceId: { $in: objectIds } },
            { workspaceId: { $in: workspaceIds } },
          ],
        },
      },
      { $group: { _id: "$workspaceId", count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.count]));
  }
}

export default new WorkspaceService();
