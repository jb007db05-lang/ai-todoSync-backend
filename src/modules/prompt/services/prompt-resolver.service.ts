import crypto from "crypto";
import { recordPromptUse } from "./prompt-usage.service.js";
import mongoose from "mongoose";
import PromptDeploymentModel from "../models/prompt-deployment.model.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import promptDeploymentService from "./prompt-deployment.service.js";
import logger from "../../../lib/logger.js";
import {
  PROMPT_FEATURES,
  extractSystemTemplate,
  renderFeatureTemplate,
  type PromptFeatureKey,
} from "../prompt-features.js";

/** Who the prompt is being resolved for. */
export interface PromptScope {
  workspaceId?: string | null;
  userId?: string | null;
}

export interface ResolvedFeaturePrompt {
  content: string;
  source: "default" | "production" | "canary";
  promptId?: string;
  version?: number;
}

/**
 * Deterministic 0-99 bucket for a user within one canary rollout. Raising the
 * percentage keeps already-exposed users on the canary; a new canary version
 * reshuffles who is exposed.
 */
export const canaryBucket = (
  rootPromptId: string,
  canaryVersion: number,
  userId: string,
): number => {
  const digest = crypto
    .createHash("sha256")
    .update(`${rootPromptId}:${canaryVersion}:${userId}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
};

export class PromptResolverService {
  /**
   * Returns the system prompt a feature should use: the workspace's bound
   * prompt (production, or canary for users in the canary bucket) or the
   * built-in default. Never throws; any problem falls back to the default.
   */
  public async resolve(
    featureKey: PromptFeatureKey,
    scope: PromptScope | undefined,
    values: Record<string, string> = {},
  ): Promise<ResolvedFeaturePrompt> {
    const fallback: ResolvedFeaturePrompt = {
      content: renderFeatureTemplate(
        PROMPT_FEATURES[featureKey].defaultTemplate,
        values,
      ),
      source: "default",
    };

    const workspaceId = scope?.workspaceId ? String(scope.workspaceId) : "";
    const userId = scope?.userId ? String(scope.userId) : "";
    if (!mongoose.Types.ObjectId.isValid(workspaceId)) {
      return fallback;
    }

    if (userId) {
      try {
        await workspaceService.assertMembership(userId, workspaceId);
      } catch {
        return fallback; // never serve another workspace's prompt
      }
    }

    try {
      const deployment = await PromptDeploymentModel.findOne({
        workspaceId,
        featureKey,
      }).lean();
      if (!deployment) return fallback;

      const rootId = String(deployment.promptId);
      const isLive = await PromptLibraryModel.exists({
        _id: rootId,
        workspaceId,
        isArchived: false,
      });
      if (!isLive) return fallback;

      const canary = deployment.canary;
      const useCanary =
        !!canary &&
        !!userId &&
        canaryBucket(rootId, canary.version, userId) < canary.percentage;
      const version = useCanary
        ? canary!.version
        : deployment.productionVersion;

      const versionDoc = await PromptVersionModel.findOne({
        promptId: rootId,
        version,
      }).lean();
      if (!versionDoc) {
        logger.warn(
          `Prompt ${rootId} v${version} bound to '${featureKey}' is missing; using built-in prompt.`,
        );
        return fallback;
      }

      const template = extractSystemTemplate(
        versionDoc.body,
        versionDoc.messages || [],
      );
      const unresolved = promptDeploymentService.findUnresolvedVariables(
        featureKey,
        template,
        versionDoc.variables || [],
      );
      if (!template.trim() || unresolved.length > 0) {
        logger.warn(
          `Prompt ${rootId} v${version} cannot render '${featureKey}' (unresolved: ${unresolved.join(", ") || "empty template"}); using built-in prompt.`,
        );
        return fallback;
      }

      const defaults: Record<string, string> = {};
      for (const v of versionDoc.variables || []) {
        if (v.defaultValue && String(v.defaultValue).trim() !== "") {
          defaults[v.name] = String(v.defaultValue);
        }
      }

      recordPromptUse(rootId);
      return {
        content: renderFeatureTemplate(template, { ...defaults, ...values }),
        source: useCanary ? "canary" : "production",
        promptId: rootId,
        version,
      };
    } catch (err) {
      logger.warn(
        `Failed to resolve library prompt for '${featureKey}'; using built-in prompt.`,
        err as Error,
      );
      return fallback;
    }
  }
}

export default new PromptResolverService();
