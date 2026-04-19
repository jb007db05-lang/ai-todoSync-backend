import mongoose from "mongoose";

import type { IProjectDocument } from "../models/project.model.js";
import type { ProjectRole } from "../models/project-member.model.js";
import {
  findUserById,
  searchUsersByEmail,
} from "../repositories/auth.repository.js";
import {
  countProjectsByUser,
  createProject,
  deleteProjectWithRelations,
  deleteProjectsWithRelations,
  getProjectById,
  getProjectByName,
  getProjectsByUser,
  updateProject,
} from "../repositories/project.repository.js";
import {
  createProjectMember,
  createProjectMembers,
  deleteProjectMembership,
  getProjectMembers,
  getProjectMembership,
  getProjectMembershipsByUser,
} from "../repositories/project-member.repository.js";
import { clearTaskAssignmentsForUser } from "../repositories/task.repository.js";

interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  userId: string;
  currentUserRole: ProjectRole;
  createdAt?: Date;
  updatedAt?: Date;
  creator?: {
    id: string;
    email: string;
    name: string | null;
  };
}

interface ProjectPayload {
  name?: string;
  description?: string;
}

interface AddProjectMemberPayload {
  userId?: unknown;
}

interface ProjectMemberUserDto {
  id: string;
  email: string;
  name: string | null;
}

interface ProjectMemberDto {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt?: Date;
  user: ProjectMemberUserDto;
}

interface UserSearchDto {
  id: string;
  email: string;
  name: string | null;
}

interface SyncProjectObject {
  name?: unknown;
}

interface PaginatedProjects {
  projects: ProjectDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ProjectAccess {
  project: IProjectDocument;
  role: ProjectRole;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class ProjectService {
  public async createProject(
    userId: string,
    payload: ProjectPayload,
  ): Promise<ProjectDto> {
    const name = this.normalizeName(payload.name);
    const description =
      typeof payload.description === "string"
        ? payload.description.trim()
        : undefined;
    const session = await mongoose.startSession();

    try {
      let project: IProjectDocument | null = null;

      await session.withTransaction(async () => {
        project = await createProject({ userId, name, description }, session);
        await createProjectMember(
          {
            projectId: project._id.toString(),
            userId,
            role: "ADMIN",
          },
          session,
        );
      });

      if (project == null) {
        throw new HttpError(500, "Project could not be created");
      }

      return this.toDto(project, "ADMIN");
    } catch (error) {
      throw this.mapPersistenceError(error);
    } finally {
      await session.endSession();
    }
  }

  public async fetchProjects(userId: string): Promise<ProjectDto[]> {
    const [projects, memberships] = await Promise.all([
      getProjectsByUser({ userId }),
      getProjectMembershipsByUser(userId),
    ]);
    const membershipByProject = new Map(
      memberships.map((membership) => [
        membership.projectId.toString(),
        membership.role,
      ]),
    );

    return projects
      .map((project) => {
        const role = membershipByProject.get(project._id.toString());
        return role ? this.toDto(project, role) : null;
      })
      .filter((project): project is ProjectDto => project != null);
  }

  public async fetchProjectsPaginated(
    userId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginatedProjects> {
    const skip = (page - 1) * limit;
    const [projects, total, memberships] = await Promise.all([
      getProjectsByUser({ userId, search, skip, limit }),
      countProjectsByUser(userId, search),
      getProjectMembershipsByUser(userId),
    ]);
    const membershipByProject = new Map(
      memberships.map((membership) => [
        membership.projectId.toString(),
        membership.role,
      ]),
    );

    return {
      projects: projects
        .map((project) => {
          const role = membershipByProject.get(project._id.toString());
          return role ? this.toDto(project, role) : null;
        })
        .filter((project): project is ProjectDto => project != null),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async updateProject(
    projectId: string,
    userId: string,
    payload: ProjectPayload,
  ): Promise<ProjectDto> {
    const access = await this.assertProjectRole(userId, projectId, "ADMIN");
    const updates: ProjectPayload = {};

    if (Object.prototype.hasOwnProperty.call(payload, "name")) {
      updates.name = this.normalizeName(payload.name);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "description")) {
      updates.description =
        typeof payload.description === "string"
          ? payload.description.trim()
          : "";
    }

    try {
      const project = await updateProject(projectId, updates);

      if (project == null) {
        throw new HttpError(404, "Project not found");
      }

      return this.toDto(project, access.role);
    } catch (error) {
      throw this.mapPersistenceError(error);
    }
  }

  public async deleteProject(projectId: string, userId: string): Promise<void> {
    await this.assertProjectRole(userId, projectId, "ADMIN");
    const project = await deleteProjectWithRelations(projectId);

    if (project == null) {
      throw new HttpError(404, "Project not found");
    }
  }

  public async bulkDeleteProjects(
    userId: string,
    projectIds: string[],
  ): Promise<number> {
    if (projectIds.length === 0) {
      return 0;
    }

    await Promise.all(
      projectIds.map((projectId) =>
        this.assertProjectRole(userId, projectId, "ADMIN"),
      ),
    );

    return deleteProjectsWithRelations(projectIds);
  }

  public async fetchProjectMembers(
    userId: string,
    projectId: string,
  ): Promise<ProjectMemberDto[]> {
    await this.assertProjectMembership(userId, projectId);
    const members = await getProjectMembers(projectId);

    return members.map((member) => ({
      id: member.id,
      projectId: member.projectId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      user: {
        id: member.user._id.toString(),
        email: member.user.email,
        name: member.user.name ?? null,
      },
    }));
  }

  public async addProjectMember(
    actorUserId: string,
    projectId: string,
    payload: AddProjectMemberPayload,
  ): Promise<ProjectMemberDto> {
    await this.assertProjectRole(actorUserId, projectId, "ADMIN");
    const targetUserId = this.normalizeIdentifier(
      payload.userId,
      "User id is required",
    );
    const [user, existingMembership] = await Promise.all([
      findUserById(targetUserId),
      getProjectMembership(projectId, targetUserId),
    ]);

    if (user == null) {
      throw new HttpError(404, "User not found");
    }

    if (existingMembership != null) {
      throw new HttpError(409, "User is already a project member");
    }

    try {
      const member = await createProjectMember({
        projectId,
        userId: targetUserId,
        role: "MEMBER",
      });

      return {
        id: member._id.toString(),
        projectId: member.projectId.toString(),
        userId: user._id.toString(),
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name ?? null,
        },
      };
    } catch (error) {
      throw this.mapPersistenceError(error);
    }
  }

  public async removeProjectMember(
    actorUserId: string,
    projectId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertProjectRole(actorUserId, projectId, "ADMIN");
    const membership = await getProjectMembership(projectId, targetUserId);

    if (membership == null) {
      throw new HttpError(404, "Project member not found");
    }

    if (membership.role === "ADMIN") {
      throw new HttpError(
        409,
        "Project admins cannot be removed from the team",
      );
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        await deleteProjectMembership(projectId, targetUserId, session);
        await clearTaskAssignmentsForUser(projectId, targetUserId, session);
      });
    } finally {
      await session.endSession();
    }
  }

  public async leaveProject(userId: string, projectId: string): Promise<void> {
    const membership = await getProjectMembership(projectId, userId);

    if (membership == null) {
      throw new HttpError(404, "You are not a member of this project");
    }

    if (membership.role === "ADMIN") {
      throw new HttpError(
        409,
        "Project admins cannot leave. They must delete the project.",
      );
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        await deleteProjectMembership(projectId, userId, session);
        await clearTaskAssignmentsForUser(projectId, userId, session);
      });
    } finally {
      await session.endSession();
    }
  }

  public async searchRegisteredUsersByEmail(
    query: unknown,
  ): Promise<UserSearchDto[]> {
    if (typeof query !== "string" || query.trim().length < 2) {
      throw new HttpError(400, "Email query must be at least 2 characters");
    }

    const users = await searchUsersByEmail(query.trim(), 10);
    return users.map((user) => ({
      id: user._id.toString(),
      email: user.email,
      name: user.name ?? null,
    }));
  }

  public async getProjectAccess(
    userId: string,
    projectId: string,
  ): Promise<ProjectAccess> {
    const [project, membership] = await Promise.all([
      getProjectById(projectId),
      getProjectMembership(projectId, userId),
    ]);

    if (project == null) {
      throw new HttpError(404, "Project not found");
    }

    if (membership == null) {
      throw new HttpError(403, "Project access denied");
    }

    return {
      project,
      role: membership.role,
    };
  }

  public async assertProjectMembership(
    userId: string,
    projectId: string,
  ): Promise<ProjectAccess> {
    return this.getProjectAccess(userId, projectId);
  }

  public async assertProjectRole(
    userId: string,
    projectId: string,
    requiredRole: ProjectRole,
  ): Promise<ProjectAccess> {
    const access = await this.getProjectAccess(userId, projectId);
    const roleOrder: Record<ProjectRole, number> = {
      MEMBER: 1,
      ADMIN: 2,
    };

    if (roleOrder[access.role] < roleOrder[requiredRole]) {
      throw new HttpError(403, "Insufficient project role");
    }

    return access;
  }

  public async assertProjectOwnership(
    userId: string,
    projectId: string,
  ): Promise<void> {
    await this.assertProjectRole(userId, projectId, "ADMIN");
  }

  public async resolveProjectForSync(
    userId: string,
    value: unknown,
  ): Promise<string | null | undefined> {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (typeof value === "string") {
      const name = this.normalizeName(value);
      const project = await this.ensureProjectByName(userId, name);
      return project._id.toString();
    }

    if (typeof value === "object") {
      const projectObject = value as SyncProjectObject;
      const name = this.normalizeName(projectObject.name);
      const project = await this.ensureProjectByName(userId, name);
      return project._id.toString();
    }

    throw new HttpError(400, "Invalid project value");
  }

  private async ensureProjectByName(
    userId: string,
    name: string,
  ): Promise<IProjectDocument> {
    const existingProject = await getProjectByName(userId, name);

    if (existingProject != null) {
      const membership = await getProjectMembership(
        existingProject._id.toString(),
        userId,
      );

      if (membership == null) {
        await createProjectMembers([
          {
            projectId: existingProject._id.toString(),
            userId,
            role: "ADMIN",
          },
        ]);
      }

      return existingProject;
    }

    try {
      const session = await mongoose.startSession();
      let project: IProjectDocument | null = null;

      try {
        await session.withTransaction(async () => {
          project = await createProject(
            {
              userId,
              name,
            },
            session,
          );
          await createProjectMember(
            {
              projectId: project._id.toString(),
              userId,
              role: "ADMIN",
            },
            session,
          );
        });
      } finally {
        await session.endSession();
      }

      if (project == null) {
        throw new HttpError(500, "Project not created");
      }

      return project;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const project = await getProjectByName(userId, name);

        if (project != null) {
          return project;
        }
      }

      throw this.mapPersistenceError(error);
    }
  }

  private toDto(
    project: IProjectDocument,
    currentUserRole: ProjectRole,
  ): ProjectDto {
    const creatorUser = project.userId as any;
    const dto: ProjectDto = {
      id: project._id.toString(),
      name: project.name,
      description: project.description,
      userId: creatorUser?._id
        ? creatorUser._id.toString()
        : project.userId.toString(),
      currentUserRole,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    if (creatorUser?._id) {
      dto.creator = {
        id: creatorUser._id.toString(),
        email: creatorUser.email,
        name: creatorUser.name ?? null,
      };
    }

    return dto;
  }

  private normalizeName(value: unknown): string {
    const name = typeof value === "string" ? value.trim() : "";

    if (!name) {
      throw new HttpError(400, "Project name is required");
    }

    return name;
  }

  private normalizeIdentifier(value: unknown, message: string): string {
    if (typeof value !== "string" || value.trim() === "") {
      throw new HttpError(400, message);
    }

    return value.trim();
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error != null &&
      "code" in error &&
      error.code === 11000
    );
  }

  private mapPersistenceError(error: unknown): Error {
    if (this.isDuplicateKeyError(error)) {
      return new HttpError(409, "Project name already exists");
    }

    return error instanceof Error ? error : new Error("Unknown error");
  }
}

const projectService = new ProjectService();

export type {
  ProjectDto,
  ProjectMemberDto,
  ProjectMemberUserDto,
  ProjectPayload,
  UserSearchDto,
};
export default projectService;
