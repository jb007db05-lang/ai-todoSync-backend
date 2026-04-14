import type { IProjectDocument } from "../models/project.model.js";
import {
  countProjectsByUser,
  createProject,
  deleteProjectWithRelations,
  getProjectByIdAndUser,
  getProjectByName,
  getProjectsByUser,
  updateProject,
} from "../repositories/project.repository.js";

interface ProjectDto {
  id: string;
  name: string;
  description?: string;
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ProjectPayload {
  name?: string;
  description?: string;
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

    try {
      const project = await createProject({ userId, name });
      return this.toDto(project);
    } catch (error) {
      throw this.mapPersistenceError(error);
    }
  }

  public async fetchProjects(userId: string): Promise<ProjectDto[]> {
    const projects = await getProjectsByUser({ userId });
    return projects.map((project) => this.toDto(project));
  }

  public async fetchProjectsPaginated(
    userId: string,
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginatedProjects> {
    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      getProjectsByUser({ userId, search, skip, limit }),
      countProjectsByUser(userId, search),
    ]);

    return {
      projects: projects.map((project) => this.toDto(project)),
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
    const existingProject = await getProjectByIdAndUser(projectId, userId);

    if (existingProject == null) {
      throw new HttpError(404, "Project not found");
    }

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
      const project = await updateProject(projectId, userId, updates);

      if (project == null) {
        throw new HttpError(404, "Project not found");
      }

      return this.toDto(project);
    } catch (error) {
      throw this.mapPersistenceError(error);
    }
  }

  public async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await deleteProjectWithRelations(userId, projectId);

    if (project == null) {
      throw new HttpError(404, "Project not found");
    }
  }

  public async bulkDeleteProjects(
    userId: string,
    projectIds: string[],
  ): Promise<number> {
    const { deleteProjectsWithRelations } =
      await import("../repositories/project.repository.js");
    return deleteProjectsWithRelations(userId, projectIds);
  }

  public async assertProjectOwnership(
    userId: string,
    projectId: string,
  ): Promise<void> {
    const project = await getProjectByIdAndUser(projectId, userId);

    if (project == null) {
      throw new HttpError(404, "Project not found");
    }
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
      return existingProject;
    }

    try {
      return await createProject({
        userId,
        name,
      });
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

  private toDto(project: IProjectDocument): ProjectDto {
    return {
      id: project._id.toString(),
      name: project.name,
      description: project.description,
      userId: project.userId.toString(),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }

  private normalizeName(value: unknown): string {
    const name = typeof value === "string" ? value.trim() : "";

    if (!name) {
      throw new HttpError(400, "Project name is required");
    }

    return name;
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

export type { ProjectDto, ProjectPayload };
export default projectService;
