import type { Request, Response, NextFunction } from "express";
import llmCatalogService from "../services/llm-catalog.service.js";

export const getProviders = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const providers = await llmCatalogService.getProviders();
    res.json({
      message: "LLM Providers retrieved successfully",
      data: { providers },
    });
  } catch (err) {
    next(err);
  }
};

export const getModels = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const providerId = req.query.provider as string | undefined;
    const models = await llmCatalogService.getModels(providerId);
    res.json({
      message: "LLM Models retrieved successfully",
      data: { models },
    });
  } catch (err) {
    next(err);
  }
};

export const getModelDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const modelId = String(req.params.modelId);
    const modelDetails = await llmCatalogService.getModelDetails(modelId);
    if (!modelDetails) {
      res.status(404).json({ message: `Model '${modelId}' not found.` });
      return;
    }
    res.json({
      message: "Model details retrieved successfully",
      data: { model: modelDetails },
    });
  } catch (err) {
    next(err);
  }
};
