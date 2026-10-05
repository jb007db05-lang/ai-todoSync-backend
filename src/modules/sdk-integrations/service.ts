import crypto from "crypto";
import { deterministicHash } from "../../utils/encryption.js";
import * as repo from "./repository.js";
import type { ISdkIntegrationDocument, SdkEnvironment } from "./model.js";
import { sdkIntegrationCache } from "./cache.js";
import type { IUserDocument } from "../auth/models/user.model.js";
import {
  SANDBOX_KEY_PREFIX,
  scopedApiKeyId,
  type DataEnvironment,
} from "../../shared/environment.js";
import logger from "../../lib/logger.js";
import { AppError } from "../../utils/app-error.js";

const generateSdkKey = (): string =>
  `sdk_${crypto.randomBytes(24).toString("hex")}`;

const generateSandboxKey = (): string =>
  `${SANDBOX_KEY_PREFIX}${crypto.randomBytes(24).toString("hex")}`;

export interface ResolvedSdkKey {
  integration: ISdkIntegrationDocument;
  environment: DataEnvironment;
}

export interface SandboxPurgeResult {
  events: number;
  exposures: number;
  surveyResponses: number;
  users: number;
}

export interface CreateIntegrationInput {
  tenantId: string;
  name: string;
  environment: SdkEnvironment;
  domain: string;
  allowedOrigins?: string[];
  description?: string;
}

export interface UpdateIntegrationInput {
  name?: string;
  environment?: string;
  domain?: string;
  allowedOrigins?: string[];
  description?: string;
}

export const normalizeOrigin = (originStr: string): string => {
  let trimmed = originStr.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    const isLocal =
      trimmed.startsWith("localhost") ||
      trimmed.startsWith("127.0.0.1") ||
      trimmed.startsWith("[::1]") ||
      trimmed.startsWith("::1");
    trimmed = (isLocal ? "http://" : "https://") + trimmed;
  }
  try {
    const url = new URL(trimmed);
    return url.origin.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

export const matchOrigin = (origin: string, pattern: string): boolean => {
  const normOrigin = normalizeOrigin(origin);
  const normPattern = normalizeOrigin(pattern);

  if (normPattern.includes("*")) {
    const escaped = normPattern.replace(/[.+*^${}()|[\]\\]/g, "\\$&");
    const regexStr =
      "^" +
      escaped
        .replace(/\\\*\\\./g, "([a-zA-Z0-9.-]+\\.)?")
        .replace(/\\\*/g, "[a-zA-Z0-9.-]*") +
      "$";
    try {
      const regex = new RegExp(regexStr);
      return regex.test(normOrigin);
    } catch {
      return normOrigin === normPattern;
    }
  }

  return normOrigin === normPattern;
};

const isLocalOrigin = (origin: string): boolean => {
  try {
    const host = new URL(normalizeOrigin(origin)).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
};

/**
 * Origin check for a resolved key. Live keys only work from the registered
 * domain and allowed origins; sandbox keys also work from localhost so
 * developers can test locally.
 */
export const validateKeyOrigin = (
  origin: string | undefined,
  integration: Pick<ISdkIntegrationDocument, "domain" | "allowedOrigins">,
  environment: DataEnvironment,
): string | null => {
  if (!origin) {
    return "Origin header is required";
  }
  try {
    const parsedOrigin = normalizeOrigin(origin);
    if (environment === "sandbox" && isLocalOrigin(parsedOrigin)) {
      return null;
    }
    const domainMatches =
      !!integration.domain && matchOrigin(parsedOrigin, integration.domain);
    const allowedMatches = (integration.allowedOrigins || []).some((o) =>
      matchOrigin(parsedOrigin, o),
    );
    if (domainMatches || allowedMatches) {
      return null;
    }
    return `Origin '${parsedOrigin}' is not allowed for this integration.`;
  } catch {
    return "Invalid Origin header format";
  }
};

class SdkIntegrationService {
  /** Create a new integration + auto-generate SDK key */
  async create(input: CreateIntegrationInput): Promise<{
    integration: ISdkIntegrationDocument;
    rawKey: string;
  }> {
    const rawKey = generateSdkKey();
    const keyHash = deterministicHash(rawKey);

    const integration = await repo.createIntegration({
      tenantId: input.tenantId,
      name: input.name.trim(),
      environment: input.environment,
      domain: normalizeOrigin(input.domain),
      allowedOrigins: (input.allowedOrigins || []).map((o) =>
        normalizeOrigin(o),
      ),
      description: input.description?.trim() ?? "",
      status: "pending",
      sdkKey: rawKey,
      sdkKeyHash: keyHash,
      connectionCount: 0,
    } as any);

    return { integration, rawKey };
  }

  /** List all integrations for a tenant */
  listByTenant(tenantId: string): Promise<ISdkIntegrationDocument[]> {
    return repo.findByTenantId(tenantId);
  }

  /** Get a single integration (scoped to tenant for security) */
  getOne(
    tenantId: string,
    id: string,
  ): Promise<ISdkIntegrationDocument | null> {
    return repo.findByTenantAndId(tenantId, id);
  }

  /** Update integration metadata */
  async update(
    tenantId: string,
    id: string,
    input: UpdateIntegrationInput,
  ): Promise<ISdkIntegrationDocument | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;

    const updated = await repo.updateIntegration(id, {
      ...(input.name && { name: input.name.trim() }),
      ...(input.environment && { environment: input.environment }),
      ...(input.domain && { domain: normalizeOrigin(input.domain) }),
      ...(input.allowedOrigins && {
        allowedOrigins: input.allowedOrigins.map((o) => normalizeOrigin(o)),
      }),
      ...(input.description !== undefined && {
        description: input.description.trim(),
      }),
    });

    if (updated) {
      sdkIntegrationCache.invalidate(
        id,
        existing.sdkKeyHash,
        existing.sandboxKeyHash,
      );
    }
    return updated;
  }

  /** Create the integration's sandbox key. The raw key is returned once. */
  async createSandbox(
    tenantId: string,
    id: string,
  ): Promise<{ integration: ISdkIntegrationDocument; rawKey: string } | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    if (existing.sandboxKeyHash) {
      throw new AppError(
        409,
        "This integration already has a sandbox. Regenerate its key instead.",
        "SANDBOX_EXISTS",
      );
    }
    return this.issueSandboxKey(existing);
  }

  /** Rotate the sandbox key; the old sandbox key stops working immediately. */
  async regenerateSandboxKey(
    tenantId: string,
    id: string,
  ): Promise<{ integration: ISdkIntegrationDocument; rawKey: string } | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    if (!existing.sandboxKeyHash) {
      throw new AppError(404, "This integration has no sandbox.", "NO_SANDBOX");
    }
    return this.issueSandboxKey(existing);
  }

  /** Delete all sandbox data (events, exposures, responses, users); keeps the key. */
  async resetSandbox(
    tenantId: string,
    id: string,
  ): Promise<SandboxPurgeResult | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    return this.purgeSandboxData(id);
  }

  /** Remove the sandbox key and all sandbox data. */
  async deleteSandbox(
    tenantId: string,
    id: string,
  ): Promise<SandboxPurgeResult | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    await repo.updateSandboxKey(id, null, null);
    sdkIntegrationCache.invalidate(
      id,
      existing.sdkKeyHash,
      existing.sandboxKeyHash,
    );
    await this.revokeSessions(existing.sandboxKeyHash);
    return this.purgeSandboxData(id);
  }

  private async issueSandboxKey(
    existing: ISdkIntegrationDocument,
  ): Promise<{ integration: ISdkIntegrationDocument; rawKey: string } | null> {
    const id = existing._id.toString();
    const rawKey = generateSandboxKey();
    const integration = await repo.updateSandboxKey(
      id,
      rawKey,
      deterministicHash(rawKey),
    );
    if (!integration) return null;
    sdkIntegrationCache.invalidate(
      id,
      existing.sdkKeyHash,
      existing.sandboxKeyHash,
    );
    await this.revokeSessions(existing.sandboxKeyHash);
    return { integration, rawKey };
  }

  private async revokeSessions(keyHash?: string | null): Promise<void> {
    if (!keyHash) return;
    const SdkSessionModel = (await import("../sdk/models/sdk-session.model.js"))
      .default;
    await SdkSessionModel.updateMany(
      { sdkKeyHash: keyHash },
      { revoked: true },
    );
  }

  private async purgeSandboxData(id: string): Promise<SandboxPurgeResult> {
    const [
      { default: AnalyticsLogModel },
      { default: AnalyticsUserModel },
      { GuideExposureModel },
      { SurveyResponseModel },
    ] = await Promise.all([
      import("../analytics/models/analytics-log.model.js"),
      import("../analytics/models/analytics-user.model.js"),
      import("../engagement/model.js"),
      import("../surveys/model.js"),
    ]);
    const sandbox = { sdkIntegrationId: id, environment: "sandbox" };
    const [events, exposures, surveyResponses, users] = await Promise.all([
      AnalyticsLogModel.deleteMany(sandbox).exec(),
      GuideExposureModel.deleteMany(sandbox).exec(),
      SurveyResponseModel.deleteMany(sandbox).exec(),
      AnalyticsUserModel.deleteMany({
        apiKeyId: scopedApiKeyId(id, "sandbox"),
      }).exec(),
    ]);
    const result = {
      events: events.deletedCount ?? 0,
      exposures: exposures.deletedCount ?? 0,
      surveyResponses: surveyResponses.deletedCount ?? 0,
      users: users.deletedCount ?? 0,
    };
    logger.info("Sandbox data purged", { sdkIntegrationId: id, ...result });
    return result;
  }

  /** Regenerate SDK key — old key immediately invalid */
  async regenerateKey(
    tenantId: string,
    id: string,
  ): Promise<{ integration: ISdkIntegrationDocument; rawKey: string } | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;

    const rawKey = generateSdkKey();
    const keyHash = deterministicHash(rawKey);
    const integration = await repo.updateSdkKey(id, rawKey, keyHash);
    if (!integration) return null;

    sdkIntegrationCache.invalidate(
      id,
      existing.sdkKeyHash,
      existing.sandboxKeyHash,
    );
    return { integration, rawKey };
  }

  /** Disable integration */
  async disable(
    tenantId: string,
    id: string,
  ): Promise<ISdkIntegrationDocument | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    const updated = await repo.updateStatus(id, "disabled");
    if (updated) {
      sdkIntegrationCache.invalidate(
        id,
        existing.sdkKeyHash,
        existing.sandboxKeyHash,
      );
    }
    return updated;
  }

  /** Re-enable a disabled integration */
  async enable(
    tenantId: string,
    id: string,
  ): Promise<ISdkIntegrationDocument | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    const newStatus = existing.connectionCount > 0 ? "connected" : "pending";
    const updated = await repo.updateStatus(id, newStatus);
    if (updated) {
      sdkIntegrationCache.invalidate(
        id,
        existing.sdkKeyHash,
        existing.sandboxKeyHash,
      );
    }
    return updated;
  }

  /** Revoke integration */
  async revoke(
    tenantId: string,
    id: string,
  ): Promise<ISdkIntegrationDocument | null> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return null;
    const updated = await repo.updateStatus(id, "revoked");
    if (updated) {
      sdkIntegrationCache.invalidate(
        id,
        existing.sdkKeyHash,
        existing.sandboxKeyHash,
      );
    }
    return updated;
  }

  /** Delete integration (preserves analytics via soft relation) */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return false;
    await repo.deleteIntegration(id);
    sdkIntegrationCache.invalidate(
      id,
      existing.sdkKeyHash,
      existing.sandboxKeyHash,
    );
    return true;
  }

  /** Resolve a live or sandbox SDK key to its integration and environment. */
  async resolveKey(keyHash: string): Promise<ResolvedSdkKey | null> {
    const integration = await this.resolveByKeyHash(keyHash);
    if (!integration) return null;
    return {
      integration,
      environment: integration.sandboxKeyHash === keyHash ? "sandbox" : "live",
    };
  }

  /** Resolve integration from SDK key (live or sandbox) — used by auth middleware */
  async resolveByKeyHash(
    keyHash: string,
  ): Promise<ISdkIntegrationDocument | null> {
    const cached = sdkIntegrationCache.getIntegrationByKeyHash(keyHash);
    if (cached) return cached;

    const integration = await repo.findByKeyHash(keyHash);
    if (integration) {
      sdkIntegrationCache.setIntegration(integration);
    }
    return integration;
  }

  /** Resolve tenant (User) document — used by auth middleware */
  async resolveTenant(tenantId: string): Promise<IUserDocument | null> {
    const cached = sdkIntegrationCache.getTenant(tenantId);
    if (cached) return cached;

    const UserModel = (await import("../auth/models/user.model.js")).default;
    const user = await UserModel.findById(tenantId);
    if (user) {
      sdkIntegrationCache.setTenant(tenantId, user);
    }
    return user;
  }

  /** Check if an origin is allowed across any active SDK integration (used by CORS preflight) */
  async isOriginAllowed(origin: string): Promise<boolean> {
    const normalized = normalizeOrigin(origin);

    // Always allow local development origins
    const isLocalhost =
      normalized.includes("localhost") ||
      normalized.includes("127.0.0.1") ||
      normalized.includes("[::1]") ||
      normalized.includes("::1");
    if (isLocalhost) {
      return true;
    }

    const cached = sdkIntegrationCache.isOriginAllowed(normalized);
    if (cached !== null) return cached;

    const SdkIntegrationModel = (await import("./model.js")).default;
    let integration = await SdkIntegrationModel.findOne({
      $or: [{ domain: normalized }, { allowedOrigins: normalized }],
      status: { $in: ["connected", "pending"] },
    });

    if (!integration) {
      const allIntegrations = await SdkIntegrationModel.find({
        status: { $in: ["connected", "pending"] },
      });
      integration = allIntegrations.find((it) => {
        if (it.domain && matchOrigin(normalized, it.domain)) return true;
        if (Array.isArray(it.allowedOrigins)) {
          return it.allowedOrigins.some((o) => matchOrigin(normalized, o));
        }
        return false;
      }) as any;
    }

    if (integration) {
      sdkIntegrationCache.setOriginAllowed(normalized, true);
      return true;
    }

    // Also check legacy AnalyticsKey model
    try {
      const AnalyticsKeyModel = (
        await import("../analytics/models/analytics-key.model.js")
      ).default;
      let keyDoc = await AnalyticsKeyModel.findOne({
        allowedOrigins: normalized,
        status: "active",
      });
      if (!keyDoc) {
        const allKeys = await AnalyticsKeyModel.find({ status: "active" });
        keyDoc = allKeys.find((k) => {
          if (Array.isArray(k.allowedOrigins)) {
            return k.allowedOrigins.some((o) => matchOrigin(normalized, o));
          }
          return false;
        }) as any;
      }
      const allowed = !!keyDoc;
      sdkIntegrationCache.setOriginAllowed(normalized, allowed);
      return allowed;
    } catch {
      sdkIntegrationCache.setOriginAllowed(normalized, false);
      return false;
    }
  }

  /** Update connection tracking after successful auth */
  touchConnection(
    id: string,
    opts: {
      sdkVersion?: string;
      latestOrigin?: string;
      touchRuntime?: boolean;
      touchEvent?: boolean;
      touchHeartbeat?: boolean;
      sandbox?: boolean;
    },
  ): Promise<ISdkIntegrationDocument | null> {
    return repo.updateConnectionTracking(id, opts);
  }
}

export default new SdkIntegrationService();
