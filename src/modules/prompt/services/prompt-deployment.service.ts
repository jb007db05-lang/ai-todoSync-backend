import type { ClientSession, Types } from "mongoose";
import PromptDeploymentModel, {
  PROMPT_DEPLOYMENT_HISTORY_LIMIT,
  type IPromptDeploymentDocument,
} from "../models/prompt-deployment.model.js";
import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import type { WorkspaceRole } from "../../workspace/models/workspace-member.model.js";
import { runInTransaction } from "../../../utils/transaction.js";
import { HttpError } from "../../../shared/errors/http-error.js";
import {
  PROMPT_FEATURES,
  PROMPT_FEATURE_KEYS,
  extractSystemTemplate,
  isPromptFeatureKey,
  listTemplatePlaceholders,
  type PromptFeatureKey,
} from "../prompt-features.js";
import type {
  IPromptCanary,
  IPromptDeploymentEvent,
  IPromptVariable,
  PromptDeploymentAction,
  PromptVersionStatus,
} from "../../../interfaces/prompt/prompt.interface.js";

type ObjectIdLike = Types.ObjectId | string;

const DEPLOY_ROLES: WorkspaceRole[] = ["OWNER", "ADMIN"];

export interface PromptDeploymentSummary {
  featureKey: string | null;
  productionVersion: number;
  stagingVersion: number | null;
  canary: IPromptCanary | null;
}

export type DeployStrategy = "direct" | "canary";

/** Where a version stands: one production, at most one canary and one staging. */
export const getVersionStatus = (
  deployment: Pick<
    PromptDeploymentSummary,
    "productionVersion" | "stagingVersion" | "canary"
  >,
  version: number,
): PromptVersionStatus => {
  if (version === deployment.productionVersion) return "production";
  if (deployment.canary?.version === version) return "canary";
  if (deployment.stagingVersion === version) return "staging";
  return "draft";
};

export interface PromptDeploymentView extends PromptDeploymentSummary {
  promptId: string;
  latestVersion: number;
  history: IPromptDeploymentEvent[];
}

export class PromptDeploymentService {
  /**
   * Creates the deployment record for a logical prompt if it does not exist,
   * pinning production to `productionVersion`. Never moves an existing pin.
   */
  public async ensureDeployment(
    workspaceId: ObjectIdLike,
    rootPromptId: ObjectIdLike,
    productionVersion: number,
    actorId: ObjectIdLike,
    session?: ClientSession,
  ): Promise<void> {
    await PromptDeploymentModel.updateOne(
      { workspaceId, promptId: rootPromptId },
      {
        $setOnInsert: {
          workspaceId,
          promptId: rootPromptId,
          featureKey: null,
          productionVersion,
          stagingVersion: null,
          canary: null,
          updatedBy: actorId,
          history: [],
        },
      },
      { upsert: true, session },
    );
  }

  public async getDeployment(
    workspaceId: string,
    userId: string,
    promptId: string,
  ): Promise<PromptDeploymentView> {
    await workspaceService.assertMembership(userId, workspaceId);
    const { rootId, latestVersion } = await this.loadPrompt(
      workspaceId,
      userId,
      promptId,
    );
    const deployment = await PromptDeploymentModel.findOne({
      workspaceId,
      promptId: rootId,
    })
      .populate("history.actor", "name email")
      .lean();

    if (!deployment) {
      // Prompts created before deployments existed serve their latest version.
      return {
        promptId: String(rootId),
        featureKey: null,
        productionVersion: latestVersion,
        stagingVersion: null,
        canary: null,
        latestVersion,
        history: [],
      };
    }

    return {
      promptId: String(rootId),
      featureKey: deployment.featureKey ?? null,
      productionVersion: deployment.productionVersion,
      stagingVersion: deployment.stagingVersion ?? null,
      canary: deployment.canary ?? null,
      latestVersion,
      history: [...(deployment.history || [])].reverse(),
    };
  }

  public async setProduction(
    workspaceId: string,
    userId: string,
    promptId: string,
    version: unknown,
  ): Promise<PromptDeploymentView> {
    const targetVersion = this.parseVersion(version);
    return this.mutate(workspaceId, userId, promptId, async (doc, rootId) => {
      await this.assertVersionExists(rootId, targetVersion);
      if (doc.featureKey) {
        await this.assertVersionCompatible(
          doc.featureKey,
          rootId,
          targetVersion,
        );
      }
      if (targetVersion === doc.productionVersion) {
        throw new HttpError(
          400,
          `v${targetVersion} is already the production version.`,
        );
      }
      // Deploying the canary version to production completes the canary.
      if (doc.canary && doc.canary.version === targetVersion) {
        doc.canary = null;
      }
      this.replaceProduction(doc, userId, "set-production", targetVersion);
    });
  }

  /**
   * Deploys a version with one of the two strategies: straight to production
   * (the current production moves to staging) or as a canary that receives
   * `percentage`% of users until it is promoted or stopped.
   */
  public async deploy(
    workspaceId: string,
    userId: string,
    promptId: string,
    payload: { version?: unknown; strategy?: unknown; percentage?: unknown },
  ): Promise<PromptDeploymentView> {
    const strategy = payload.strategy ?? "direct";
    if (strategy === "direct") {
      return this.setProduction(workspaceId, userId, promptId, payload.version);
    }
    if (strategy === "canary") {
      return this.startCanary(
        workspaceId,
        userId,
        promptId,
        payload.version,
        payload.percentage,
      );
    }
    throw new HttpError(400, "strategy must be 'direct' or 'canary'.");
  }

  /**
   * Swaps production and staging: the staging version goes back to
   * production and the version that was live moves to staging. A running
   * canary is stopped, since it was measured against the old production.
   */
  public async rollback(
    workspaceId: string,
    userId: string,
    promptId: string,
  ): Promise<PromptDeploymentView> {
    return this.mutate(workspaceId, userId, promptId, async (doc, rootId) => {
      const target = doc.stagingVersion;
      if (!target) {
        throw new HttpError(
          400,
          "Nothing to roll back to: no version is in staging.",
        );
      }
      await this.assertVersionExists(rootId, target);
      if (doc.featureKey) {
        await this.assertVersionCompatible(doc.featureKey, rootId, target);
      }
      if (doc.canary) {
        this.record(doc, userId, "abort-canary", {
          version: doc.canary.version,
          percentage: doc.canary.percentage,
        });
        doc.canary = null;
      }
      this.replaceProduction(doc, userId, "rollback", target);
    });
  }

  public async startCanary(
    workspaceId: string,
    userId: string,
    promptId: string,
    version: unknown,
    percentage: unknown,
  ): Promise<PromptDeploymentView> {
    const canaryVersion = this.parseVersion(version);
    const canaryPercentage = this.parsePercentage(percentage);
    return this.mutate(workspaceId, userId, promptId, async (doc, rootId) => {
      if (canaryVersion === doc.productionVersion) {
        throw new HttpError(
          400,
          `v${canaryVersion} is already the production version.`,
        );
      }
      await this.assertVersionExists(rootId, canaryVersion);
      if (doc.featureKey) {
        await this.assertVersionCompatible(
          doc.featureKey,
          rootId,
          canaryVersion,
        );
      }
      const isUpdate = doc.canary?.version === canaryVersion;
      doc.canary = {
        version: canaryVersion,
        percentage: canaryPercentage,
        startedAt: isUpdate && doc.canary ? doc.canary.startedAt : new Date(),
      };
      this.record(doc, userId, isUpdate ? "update-canary" : "start-canary", {
        version: canaryVersion,
        percentage: canaryPercentage,
      });
    });
  }

  public async promoteCanary(
    workspaceId: string,
    userId: string,
    promptId: string,
  ): Promise<PromptDeploymentView> {
    return this.mutate(workspaceId, userId, promptId, async (doc) => {
      if (!doc.canary) {
        throw new HttpError(400, "No canary is running for this prompt.");
      }
      const canary = doc.canary;
      doc.canary = null;
      this.replaceProduction(doc, userId, "promote-canary", canary.version, {
        percentage: canary.percentage,
      });
    });
  }

  public async abortCanary(
    workspaceId: string,
    userId: string,
    promptId: string,
  ): Promise<PromptDeploymentView> {
    return this.mutate(workspaceId, userId, promptId, async (doc) => {
      if (!doc.canary) {
        throw new HttpError(400, "No canary is running for this prompt.");
      }
      this.record(doc, userId, "abort-canary", {
        version: doc.canary.version,
        percentage: doc.canary.percentage,
      });
      doc.canary = null;
    });
  }

  /**
   * Binds the prompt to an AI feature (or unbinds with `null`). A feature has
   * at most one prompt per workspace; binding moves it off any previous prompt.
   */
  public async bindFeature(
    workspaceId: string,
    userId: string,
    promptId: string,
    featureKey: unknown,
  ): Promise<PromptDeploymentView> {
    if (featureKey !== null && !isPromptFeatureKey(featureKey)) {
      throw new HttpError(
        400,
        `featureKey must be null or one of: ${PROMPT_FEATURE_KEYS.join(", ")}.`,
      );
    }

    return this.mutate(
      workspaceId,
      userId,
      promptId,
      async (doc, rootId, session) => {
        if (doc.featureKey === featureKey) return;

        if (featureKey) {
          await this.assertVersionCompatible(
            featureKey,
            rootId,
            doc.productionVersion,
          );
          if (doc.canary) {
            await this.assertVersionCompatible(
              featureKey,
              rootId,
              doc.canary.version,
            );
          }

          const holder = await PromptDeploymentModel.findOne({
            workspaceId,
            featureKey,
            promptId: { $ne: rootId },
          }).session(session ?? null);
          if (holder) {
            holder.featureKey = null;
            this.record(holder, userId, "unbind-feature", { featureKey });
            await holder.save({ session });
          }
        }

        const previousKey = doc.featureKey;
        doc.featureKey = featureKey;
        this.record(
          doc,
          userId,
          featureKey ? "bind-feature" : "unbind-feature",
          { featureKey: featureKey ?? previousKey ?? null },
        );
      },
    );
  }

  /** Archived prompts must stop serving traffic. */
  public async retire(
    workspaceId: ObjectIdLike,
    rootPromptId: ObjectIdLike,
    actorId: string,
  ): Promise<void> {
    const doc = await PromptDeploymentModel.findOne({
      workspaceId,
      promptId: rootPromptId,
    });
    if (!doc || (!doc.featureKey && !doc.canary)) return;
    if (doc.canary) {
      this.record(doc, actorId, "abort-canary", {
        version: doc.canary.version,
        percentage: doc.canary.percentage,
      });
      doc.canary = null;
    }
    if (doc.featureKey) {
      this.record(doc, actorId, "unbind-feature", {
        featureKey: doc.featureKey,
      });
      doc.featureKey = null;
    }
    await doc.save();
  }

  /** Feature registry plus which prompt currently serves each feature. */
  public async listFeatures(workspaceId: string, userId: string) {
    await workspaceService.assertMembership(userId, workspaceId);
    const deployments = await PromptDeploymentModel.find({
      workspaceId,
      featureKey: { $type: "string" },
    }).lean();

    const rootIds = deployments.map((d) => d.promptId);
    const latestRevisions = await PromptLibraryModel.find({
      workspaceId,
      isLatest: true,
      $or: [{ _id: { $in: rootIds } }, { parentId: { $in: rootIds } }],
    })
      .select("_id parentId name")
      .lean();
    const nameByRoot = new Map<string, { id: string; name: string }>();
    for (const rev of latestRevisions) {
      const root = String(rev.parentId || rev._id);
      nameByRoot.set(root, { id: String(rev._id), name: rev.name });
    }

    return PROMPT_FEATURE_KEYS.map((key) => {
      const def = PROMPT_FEATURES[key];
      const deployment = deployments.find((d) => d.featureKey === key);
      const prompt = deployment
        ? nameByRoot.get(String(deployment.promptId))
        : undefined;
      return {
        key,
        label: def.label,
        description: def.description,
        variables: def.variables,
        defaultTemplate: def.defaultTemplate,
        binding: deployment
          ? {
              promptId: prompt?.id ?? String(deployment.promptId),
              promptName: prompt?.name ?? "Unknown prompt",
              productionVersion: deployment.productionVersion,
              stagingVersion: deployment.stagingVersion ?? null,
              canary: deployment.canary ?? null,
            }
          : null,
      };
    });
  }

  /** Deployment state for many logical prompts at once, keyed by root id. */
  public async getSummaries(
    workspaceId: string,
    rootPromptIds: ObjectIdLike[],
  ): Promise<Map<string, PromptDeploymentSummary>> {
    const docs = await PromptDeploymentModel.find({
      workspaceId,
      promptId: { $in: rootPromptIds },
    })
      .select("promptId featureKey productionVersion stagingVersion canary")
      .lean();
    return new Map(
      docs.map((d) => [
        String(d.promptId),
        {
          featureKey: d.featureKey ?? null,
          productionVersion: d.productionVersion,
          stagingVersion: d.stagingVersion ?? null,
          canary: d.canary ?? null,
        },
      ]),
    );
  }

  /**
   * Rejects versions whose system template references variables the feature
   * does not supply (and that have no default), which would otherwise reach
   * the model as literal {{placeholders}}.
   */
  public async assertVersionCompatible(
    featureKey: PromptFeatureKey | string,
    rootPromptId: ObjectIdLike,
    version: number,
  ): Promise<void> {
    if (!isPromptFeatureKey(featureKey)) return;
    const versionDoc = await PromptVersionModel.findOne({
      promptId: rootPromptId,
      version,
    }).lean();
    if (!versionDoc) {
      throw new HttpError(404, `Version ${version} not found for this prompt.`);
    }

    const template = extractSystemTemplate(
      versionDoc.body,
      versionDoc.messages || [],
    );
    if (!template.trim()) {
      throw new HttpError(
        400,
        `v${version} has no system instructions to serve for '${PROMPT_FEATURES[featureKey].label}'.`,
      );
    }

    const unresolved = this.findUnresolvedVariables(
      featureKey,
      template,
      versionDoc.variables || [],
    );
    if (unresolved.length > 0) {
      throw new HttpError(
        400,
        `v${version} uses variables that '${PROMPT_FEATURES[featureKey].label}' does not supply: ${unresolved.join(", ")}. Give them default values or remove them.`,
      );
    }
  }

  public findUnresolvedVariables(
    featureKey: PromptFeatureKey,
    template: string,
    variables: IPromptVariable[],
  ): string[] {
    const supplied = new Set(
      PROMPT_FEATURES[featureKey].variables.map((v) => v.name),
    );
    const withDefaults = new Set(
      variables
        .filter((v) => v.defaultValue && String(v.defaultValue).trim() !== "")
        .map((v) => v.name),
    );
    return listTemplatePlaceholders(template).filter(
      (name) => !supplied.has(name) && !withDefaults.has(name),
    );
  }

  /** The only place production changes: the replaced version moves to staging. */
  private replaceProduction(
    doc: IPromptDeploymentDocument,
    actorId: string,
    action: Extract<
      PromptDeploymentAction,
      "set-production" | "promote-canary" | "rollback"
    >,
    version: number,
    details: { percentage?: number } = {},
  ): void {
    const previous = doc.productionVersion;
    doc.productionVersion = version;
    doc.stagingVersion = previous;
    this.record(doc, actorId, action, {
      version,
      previousVersion: previous,
      ...details,
    });
  }

  private async mutate(
    workspaceId: string,
    userId: string,
    promptId: string,
    apply: (
      doc: IPromptDeploymentDocument,
      rootId: ObjectIdLike,
      session: ClientSession | undefined,
    ) => Promise<void>,
  ): Promise<PromptDeploymentView> {
    await workspaceService.assertMembership(userId, workspaceId, DEPLOY_ROLES);
    const { rootId, latestVersion, isArchived } = await this.loadPrompt(
      workspaceId,
      userId,
      promptId,
    );
    if (isArchived) {
      throw new HttpError(400, "Archived prompts cannot be deployed.");
    }

    await runInTransaction(async (session) => {
      await this.ensureDeployment(
        workspaceId,
        rootId,
        latestVersion,
        userId,
        session,
      );
      const doc = await PromptDeploymentModel.findOne({
        workspaceId,
        promptId: rootId,
      }).session(session ?? null);
      if (!doc) {
        throw new HttpError(500, "Failed to load prompt deployment.");
      }
      await apply(doc, rootId, session);
      doc.updatedBy = userId;
      await doc.save({ session });
    });

    return this.getDeployment(workspaceId, userId, promptId);
  }

  private async loadPrompt(
    workspaceId: string,
    userId: string,
    promptId: string,
  ) {
    const prompt = await PromptLibraryModel.findOne({
      _id: promptId,
      workspaceId,
    }).lean();
    if (!prompt) {
      throw new HttpError(404, "Prompt not found.");
    }
    await promptAuthorizationService.assertPromptAccess(
      prompt,
      userId,
      workspaceId,
    );

    const rootId = prompt.parentId || prompt._id;
    const latest = await PromptVersionModel.findOne({ promptId: rootId })
      .sort({ version: -1 })
      .select("version")
      .lean();

    return {
      rootId,
      latestVersion: latest?.version ?? prompt.version,
      isArchived: prompt.isArchived,
    };
  }

  private async assertVersionExists(
    rootPromptId: ObjectIdLike,
    version: number,
  ): Promise<void> {
    const exists = await PromptVersionModel.exists({
      promptId: rootPromptId,
      version,
    });
    if (!exists) {
      throw new HttpError(404, `Version ${version} not found for this prompt.`);
    }
  }

  private record(
    doc: IPromptDeploymentDocument,
    actorId: string,
    action: PromptDeploymentAction,
    details: Partial<Omit<IPromptDeploymentEvent, "action" | "actor" | "at">>,
  ): void {
    doc.history.push({ action, actor: actorId, at: new Date(), ...details });
    if (doc.history.length > PROMPT_DEPLOYMENT_HISTORY_LIMIT) {
      doc.history.splice(
        0,
        doc.history.length - PROMPT_DEPLOYMENT_HISTORY_LIMIT,
      );
    }
  }

  private parseVersion(value: unknown): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1) {
      throw new HttpError(400, "version must be a positive integer.");
    }
    return num;
  }

  private parsePercentage(value: unknown): number {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1 || num > 99) {
      throw new HttpError(
        400,
        "Canary percentage must be an integer between 1 and 99. Promote the canary to send it 100% of traffic.",
      );
    }
    return num;
  }
}

export default new PromptDeploymentService();
