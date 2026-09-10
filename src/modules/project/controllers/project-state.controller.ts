import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../types/auth.js";
import ProjectModel from "../models/project.model.js";
import projectService from "../services/project.service.js";
import { AppError } from "../../../utils/app-error.js";

export const getProjectStates = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!._id.toString();
    const { id: projectId } = req.params as Record<string, string>;
    await projectService.assertProjectMembership(userId, projectId);

    const project = await ProjectModel.findById(projectId).lean();
    if (!project) throw new AppError(404, "Project not found", "NOT_FOUND");

    const states = (project.states ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    res.status(200).json({ states });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const createProjectState = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!._id.toString();
    const { id: projectId } = req.params as Record<string, string>;
    await projectService.assertProjectRole(userId, projectId, "ADMIN");

    const { name, color, category, description } = req.body;
    if (!name?.trim()) {
      throw new AppError(400, "State name is required", "BAD_REQUEST");
    }

    const project = await ProjectModel.findById(projectId);
    if (!project) throw new AppError(404, "Project not found", "NOT_FOUND");

    const position = (project.states ?? []).length;
    const newState = {
      name: name.trim(),
      description: description || "",
      color: color || "#3B82F6",
      category: category || "STARTED",
      position,
      isDefault: false,
      isTerminal: false,
    };

    project.states = [...(project.states ?? []), newState as any];
    await project.save();

    const state = project.states[project.states.length - 1];
    res.status(201).json({ state });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const updateProjectState = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!._id.toString();
    const { id: projectId, stateId } = req.params as Record<string, string>;
    await projectService.assertProjectRole(userId, projectId, "ADMIN");

    const { name, color, category, description, position } = req.body;

    const project = await ProjectModel.findById(projectId);
    if (!project) throw new AppError(404, "Project not found", "NOT_FOUND");

    const state = (project.states ?? []).find(
      (s) => s._id?.toString() === stateId,
    );
    if (!state) {
      throw new AppError(404, "Project state not found", "NOT_FOUND");
    }

    if (name !== undefined) state.name = name.trim();
    if (color !== undefined) state.color = color;
    if (category !== undefined) state.category = category;
    if (description !== undefined) state.description = description;
    if (position !== undefined) state.position = position;

    project.markModified("states");
    await project.save();

    res.status(200).json({ state });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const deleteProjectState = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!._id.toString();
    const { id: projectId, stateId } = req.params as Record<string, string>;
    await projectService.assertProjectRole(userId, projectId, "ADMIN");

    const project = await ProjectModel.findById(projectId);
    if (!project) throw new AppError(404, "Project not found", "NOT_FOUND");

    const initialLength = (project.states ?? []).length;
    project.states = (project.states ?? []).filter(
      (s) => s._id?.toString() !== stateId,
    ) as any;

    if ((project.states ?? []).length === initialLength) {
      throw new AppError(404, "Project state not found", "NOT_FOUND");
    }

    project.markModified("states");
    await project.save();

    res.status(200).json({ message: "State deleted successfully" });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

export const reorderProjectStates = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!._id.toString();
    const { id: projectId } = req.params as Record<string, string>;
    const { stateIds } = req.body;

    await projectService.assertProjectRole(userId, projectId, "ADMIN");

    if (!Array.isArray(stateIds)) {
      throw new AppError(400, "stateIds array is required", "BAD_REQUEST");
    }

    const project = await ProjectModel.findById(projectId);
    if (!project) throw new AppError(404, "Project not found", "NOT_FOUND");

    stateIds.forEach((stateId: string, index: number) => {
      const state = (project.states ?? []).find(
        (s) => s._id?.toString() === stateId,
      );
      if (state) state.position = index;
    });

    project.markModified("states");
    await project.save();

    const states = (project.states ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    res.status(200).json({ states });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
