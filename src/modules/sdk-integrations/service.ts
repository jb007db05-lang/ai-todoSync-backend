import crypto from "crypto";
import { deterministicHash } from "../../utils/encryption.js";
import * as repo from "./repository.js";
import type {
  ISdkIntegrationDocument,
  SdkEnvironment,
} from "./model.js";
import { sdkIntegrationCache } from "./cache.js";
import type { IUserDocument } from "../../models/user.model.js";

const generateSdkKey = (): string =>
  `sdk_${crypto.randomBytes(24).toString("hex")}`;

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
      allowedOrigins: (input.allowedOrigins || []).map((o) => normalizeOrigin(o)),
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
      sdkIntegrationCache.invalidate(id, existing.sdkKeyHash);
    }
    return updated;
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

    sdkIntegrationCache.invalidate(id, existing.sdkKeyHash);
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
      sdkIntegrationCache.invalidate(id, existing.sdkKeyHash);
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
    const newStatus =
      existing.connectionCount > 0 ? "connected" : "pending";
    const updated = await repo.updateStatus(id, newStatus);
    if (updated) {
      sdkIntegrationCache.invalidate(id, existing.sdkKeyHash);
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
      sdkIntegrationCache.invalidate(id, existing.sdkKeyHash);
    }
    return updated;
  }

  /** Delete integration (preserves analytics via soft relation) */
  async delete(tenantId: string, id: string): Promise<boolean> {
    const existing = await repo.findByTenantAndId(tenantId, id);
    if (!existing) return false;
    await repo.deleteIntegration(id);
    sdkIntegrationCache.invalidate(id, existing.sdkKeyHash);
    return true;
  }

  /** Resolve integration from SDK key — used by auth middleware */
  async resolveByKeyHash(keyHash: string): Promise<ISdkIntegrationDocument | null> {
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

    const UserModel = (await import("../../models/user.model.js")).default;
    const user = await UserModel.findById(tenantId);
    if (user) {
      sdkIntegrationCache.setTenant(tenantId, user);
    }
    return user;
  }

  /** Check if an origin is allowed across any active SDK integration (used by CORS preflight) */
  async isOriginAllowed(origin: string): Promise<boolean> {
    const normalized = normalizeOrigin(origin);
    const cached = sdkIntegrationCache.isOriginAllowed(normalized);
    if (cached !== null) return cached;

    const SdkIntegrationModel = (await import("./model.js")).default;
    const integration = await SdkIntegrationModel.findOne({
      $or: [
        { domain: normalized },
        { allowedOrigins: normalized },
      ],
      status: { $in: ["connected", "pending"] },
    });

    const allowed = !!integration;
    sdkIntegrationCache.setOriginAllowed(normalized, allowed);
    return allowed;
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
    },
  ): Promise<ISdkIntegrationDocument | null> {
    return repo.updateConnectionTracking(id, opts);
  }
}

export default new SdkIntegrationService();
