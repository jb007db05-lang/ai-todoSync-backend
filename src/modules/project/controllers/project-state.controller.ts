import type { Response } from "express";
import type { AuthenticatedRequest } from "../../../types/auth.js";
import ProjectStateModel from "../models/project-state.model.js";
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

    const states = await ProjectStateModel.find({ projectId })
      .sort({ position: 1 })
      .lean();

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

    const count = await ProjectStateModel.countDocuments({ projectId });
    const state = await ProjectStateModel.create({
      projectId,
      name: name.trim(),
      description: description || "",
      color: color || "#3B82F6",
      category: category || "STARTED",
      position: count,
    });

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
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (color !== undefined) updates.color = color;
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (position !== undefined) updates.position = position;

    const state = await ProjectStateModel.findOneAndUpdate(
      { _id: stateId, projectId },
      updates,
      { new: true },
    ).lean();

    if (!state) {
      throw new AppError(404, "Project state not found", "NOT_FOUND");
    }

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

    const state = await ProjectStateModel.findOneAndDelete({
      _id: stateId,
      projectId,
    });

    if (!state) {
      throw new AppError(404, "Project state not found", "NOT_FOUND");
    }

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

    await Promise.all(
      stateIds.map((stateId: string, index: number) =>
        ProjectStateModel.updateOne(
          { _id: stateId, projectId },
          { position: index },
        ),
      ),
    );

    const states = await ProjectStateModel.find({ projectId })
      .sort({ position: 1 })
      .lean();

    res.status(200).json({ states });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};
