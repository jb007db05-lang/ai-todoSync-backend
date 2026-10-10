import mongoose from "mongoose";
import { AppError } from "../../utils/app-error.js";
import WorkspaceMemberModel, {
  type WorkspaceRole,
} from "../workspace/models/workspace-member.model.js";
import ProjectModel, {
  type IProjectDocument,
} from "../project/models/project.model.js";
import ProjectMemberModel from "../project/models/project-member.model.js";
import { getProjectById } from "../project/repositories/project.repository.js";
import PromptMemberAccessModel from "./prompt-member-access.model.js";
import {
  ADMIN_ROLES,
  PERMISSIONS,
  effectivePermissions,
  isAdminRole,
  type PermissionKey,
  type PermissionSet,
} from "./permissions.js";

/** What one user may do inside one workspace. */
export interface WorkspaceAccess {
  workspaceId: string;
  userId: string;
  memberId: string;
  role: WorkspaceRole;
  isAdmin: boolean;
  permissions: PermissionSet;
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const isIdOrUuid = (value: unknown): value is string =>
  isId(value) || isUuid(value);

/** Resources outside the caller's workspace are reported as missing, never as forbidden. */
const notFound = (what: string) =>
  new AppError(404, `${what} not found`, "NOT_FOUND");

const permissionLabel = (key: PermissionKey) =>
  PERMISSIONS.find((p) => p.key === key)?.label ?? key;

export const can = (access: WorkspaceAccess, key: PermissionKey): boolean =>
  access.isAdmin || access.permissions[key] === true;

class AccessService {
  /**
   * Membership of `userId` in `workspaceId`. A missing workspace and a
   * workspace the user does not belong to look the same (404), so the API
   * never confirms that another tenant's workspace exists.
   */
  public async resolve(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceAccess> {
    if (!isId(workspaceId)) throw notFound("Workspace");
    const member = await WorkspaceMemberModel.findOne({ workspaceId, userId })
      .lean()
      .exec();
    if (!member) throw notFound("Workspace");
    return {
      workspaceId: String(workspaceId),
      userId: String(userId),
      memberId: member._id.toString(),
      role: member.role,
      isAdmin: isAdminRole(member.role),
      permissions: effectivePermissions(member.role, member.permissions),
    };
  }

  /** Access in the user's first workspace (created on first use). */
  public async resolveDefault(userId: string): Promise<WorkspaceAccess> {
    const workspaceId = await this.defaultWorkspaceId(userId);
    return this.resolve(userId, workspaceId);
  }

  public async defaultWorkspaceId(userId: string): Promise<string> {
    const { default: workspaceService } =
      await import("../workspace/services/workspace.service.js");
    const workspace =
      await workspaceService.getOrCreateDefaultWorkspace(userId);
    return workspace._id.toString();
  }

  /** Throws 403 unless the member holds every listed permission. */
  public require(access: WorkspaceAccess, ...keys: PermissionKey[]): void {
    const missing = keys.find((key) => !can(access, key));
    if (missing) {
      throw new AppError(
        403,
        `You need the "${permissionLabel(missing)}" permission for this.`,
        "PERMISSION_DENIED",
      );
    }
  }

  /**
   * Ids of the workspace projects the member can open. Admins see every
   * project in the workspace; members only those they were added to.
   */
  public async accessibleProjectIds(
    access: WorkspaceAccess,
  ): Promise<string[]> {
    const inWorkspace = await ProjectModel.find({
      workspaceId: access.workspaceId,
    })
      .select({ _id: 1 })
      .lean()
      .exec();
    const ids = inWorkspace.map((p) => p._id.toString());
    if (access.isAdmin || ids.length === 0) return ids;

    const memberships = await ProjectMemberModel.find({
      userId: access.userId,
      projectId: { $in: ids },
    })
      .select({ projectId: 1 })
      .lean()
      .exec();
    return memberships.map((m) => m.projectId.toString());
  }

  /** Every project in the workspaces where the user is an owner or admin. */
  public async adminProjectIds(userId: string): Promise<string[]> {
    const adminOf = await WorkspaceMemberModel.find({
      userId,
      role: { $in: ADMIN_ROLES },
    })
      .select({ workspaceId: 1 })
      .lean()
      .exec();
    if (adminOf.length === 0) return [];
    const projects = await ProjectModel.find({
      workspaceId: { $in: adminOf.map((m) => m.workspaceId) },
    })
      .select({ _id: 1 })
      .lean()
      .exec();
    return projects.map((p) => p._id.toString());
  }

  /**
   * Analytics scope: the projects the member can open in the workspace
   * (their default workspace when none is given) and their role in each.
   * Workspace admins count as admins of every project.
   */
  public async projectScope(
    userId: string,
    workspaceId?: string,
  ): Promise<{
    access: WorkspaceAccess;
    projectIds: string[];
    roles: Map<string, "ADMIN" | "MEMBER">;
  }> {
    const access = workspaceId
      ? await this.resolve(userId, workspaceId)
      : await this.resolveDefault(userId);
    const projectIds = await this.accessibleProjectIds(access);
    const roles = new Map<string, "ADMIN" | "MEMBER">();
    if (access.isAdmin) {
      projectIds.forEach((id) => roles.set(id, "ADMIN"));
    } else if (projectIds.length > 0) {
      const memberships = await ProjectMemberModel.find({
        userId,
        projectId: { $in: projectIds },
      })
        .select({ projectId: 1, role: 1 })
        .lean()
        .exec();
      memberships.forEach((m) =>
        roles.set(
          m.projectId.toString(),
          m.role === "ADMIN" ? "ADMIN" : "MEMBER",
        ),
      );
    }
    return { access, projectIds, roles };
  }

  /**
   * A project the member may open: 404 when it belongs to another workspace,
   * 403 when it is in this workspace but the member was not given access.
   */
  public async assertProject(
    access: WorkspaceAccess,
    projectId: string,
  ): Promise<IProjectDocument> {
    if (!isIdOrUuid(projectId)) throw notFound("Project");
    const project = await getProjectById(projectId);
    if (
      !project ||
      String(project.workspaceId) !== String(access.workspaceId)
    ) {
      throw notFound("Project");
    }
    if (!access.isAdmin) {
      const member = await ProjectMemberModel.exists({
        projectId: project._id,
        userId: access.userId,
      });
      if (!member) {
        throw new AppError(
          403,
          "You have not been given access to this project.",
          "PROJECT_ACCESS_DENIED",
        );
      }
    }
    return project;
  }

  /**
   * For routes addressed by project (or by a task/time entry inside one):
   * derives the workspace from the project, then checks membership and
   * project access.
   */
  public async resolveForProject(
    userId: string,
    projectId: string,
  ): Promise<{ access: WorkspaceAccess; project: IProjectDocument }> {
    if (!isIdOrUuid(projectId)) throw notFound("Project");
    const project = await getProjectById(projectId);
    if (!project) throw notFound("Project");
    const workspaceId = await this.projectWorkspaceId(project);
    let access: WorkspaceAccess;
    try {
      access = await this.resolve(userId, workspaceId);
    } catch {
      throw notFound("Project");
    }
    return { access, project: await this.assertProject(access, projectId) };
  }

  /**
   * The project's workspace. Projects created before workspaces were
   * mandatory are moved into their owner's default workspace on first use.
   */
  public async projectWorkspaceId(project: IProjectDocument): Promise<string> {
    if (!project.workspaceId) {
      project.workspaceId = new mongoose.Types.ObjectId(
        await this.defaultWorkspaceId(String(project.userId)),
      );
      await project.save();
    }
    return String(project.workspaceId);
  }

  /** Adds the user to the workspace with role defaults unless already a member. */
  public async ensureWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = "MEMBER",
  ): Promise<void> {
    await WorkspaceMemberModel.updateOne(
      { workspaceId, userId },
      { $setOnInsert: { workspaceId, userId, role, joinedAt: new Date() } },
      { upsert: true },
    );
  }

  /** The user must be a member of the workspace (e.g. before being added to a project). */
  public async assertWorkspaceMember(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    if (!isId(userId)) throw notFound("Member");
    const exists = await WorkspaceMemberModel.exists({ workspaceId, userId });
    if (!exists) {
      throw new AppError(
        400,
        "Add this person to the workspace before giving them project access.",
        "NOT_A_WORKSPACE_MEMBER",
      );
    }
  }

  /**
   * Mongo filter for the prompts a member can see in the workspace: their
   * own, workspace-wide ones, ones in projects they can open, and ones shared
   * with them individually. Admins see every prompt in the workspace.
   */
  public async promptVisibilityFilter(
    access: WorkspaceAccess,
  ): Promise<Record<string, unknown>> {
    if (access.isAdmin) return { workspaceId: access.workspaceId };
    const [projectIds, grants] = await Promise.all([
      this.accessibleProjectIds(access),
      this.sharedPromptIds(access),
    ]);
    return {
      workspaceId: access.workspaceId,
      $or: [
        { createdBy: access.userId },
        { visibility: "organization" },
        { visibility: "project", projectId: { $in: projectIds } },
        { _id: { $in: grants } },
        { parentId: { $in: grants } },
      ],
    };
  }

  /** Whether the member may open one prompt (same rules as the filter). */
  public async canSeePrompt(
    access: WorkspaceAccess,
    prompt: {
      _id: unknown;
      parentId?: unknown;
      workspaceId?: unknown;
      projectId?: unknown;
      visibility?: string;
      createdBy?: unknown;
    },
  ): Promise<boolean> {
    if (String(prompt.workspaceId) !== access.workspaceId) return false;
    if (access.isAdmin) return true;
    const creator =
      typeof prompt.createdBy === "object" &&
      prompt.createdBy !== null &&
      "_id" in prompt.createdBy
        ? String((prompt.createdBy as { _id: unknown })._id)
        : String(prompt.createdBy ?? "");
    if (creator === access.userId) return true;
    if (prompt.visibility === "organization") return true;
    if (prompt.visibility === "project" && prompt.projectId) {
      const projectIds = await this.accessibleProjectIds(access);
      if (projectIds.includes(String(prompt.projectId))) return true;
    }
    const rawRoot = prompt.parentId ?? prompt._id ?? (prompt as any).id;
    if (!rawRoot) return false;
    const rootId = String(rawRoot);
    if (
      !rootId ||
      rootId === "undefined" ||
      !mongoose.Types.ObjectId.isValid(rootId)
    ) {
      return false;
    }
    return Boolean(
      await PromptMemberAccessModel.exists({
        promptId: rootId,
        userId: access.userId,
      }),
    );
  }

  public async sharedPromptIds(access: WorkspaceAccess): Promise<string[]> {
    if (
      !access.workspaceId ||
      !mongoose.Types.ObjectId.isValid(access.workspaceId) ||
      !mongoose.Types.ObjectId.isValid(access.userId)
    ) {
      return [];
    }
    const grants = await PromptMemberAccessModel.find({
      workspaceId: access.workspaceId,
      userId: access.userId,
    })
      .select({ promptId: 1 })
      .lean()
      .exec();
    return grants.map((g) => g.promptId.toString());
  }
}

export default new AccessService();
