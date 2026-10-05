import type { ISdkIntegrationDocument } from "./model.js";
import type { IUserDocument } from "../auth/models/user.model.js";

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class SdkIntegrationCache {
  private integrationsByKeyHash = new Map<
    string,
    CacheEntry<ISdkIntegrationDocument>
  >();
  private integrationsById = new Map<
    string,
    CacheEntry<ISdkIntegrationDocument>
  >();
  private tenantsById = new Map<string, CacheEntry<IUserDocument>>();
  private allowedOrigins = new Map<string, CacheEntry<boolean>>();

  private defaultTtl = 5 * 60 * 1000; // 5 minutes

  public getIntegrationByKeyHash(
    keyHash: string,
  ): ISdkIntegrationDocument | null {
    const entry = this.integrationsByKeyHash.get(keyHash);
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    return null;
  }

  public getIntegrationById(id: string): ISdkIntegrationDocument | null {
    const entry = this.integrationsById.get(id);
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    return null;
  }

  public getTenant(tenantId: string): IUserDocument | null {
    const entry = this.tenantsById.get(tenantId);
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    return null;
  }

  public isOriginAllowed(origin: string): boolean | null {
    const entry = this.allowedOrigins.get(origin);
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    return null;
  }

  public setIntegration(integration: ISdkIntegrationDocument): void {
    const expiry = Date.now() + this.defaultTtl;
    const id = integration._id.toString();
    const keyHash = integration.sdkKeyHash;

    const entry = { data: integration, expiry };
    this.integrationsByKeyHash.set(keyHash, entry);
    if (integration.sandboxKeyHash) {
      this.integrationsByKeyHash.set(integration.sandboxKeyHash, entry);
    }
    this.integrationsById.set(id, entry);
  }

  public setTenant(tenantId: string, user: IUserDocument): void {
    const expiry = Date.now() + this.defaultTtl;
    this.tenantsById.set(tenantId, { data: user, expiry });
  }

  public setOriginAllowed(origin: string, allowed: boolean): void {
    const expiry = Date.now() + this.defaultTtl;
    this.allowedOrigins.set(origin, { data: allowed, expiry });
  }

  public invalidate(
    id: string,
    ...keyHashes: Array<string | null | undefined>
  ): void {
    const hashes = new Set(keyHashes.filter((h): h is string => !!h));
    const entry = this.integrationsById.get(id);
    if (entry) {
      hashes.add(entry.data.sdkKeyHash);
      if (entry.data.sandboxKeyHash) hashes.add(entry.data.sandboxKeyHash);
    }

    this.integrationsById.delete(id);
    hashes.forEach((hash) => this.integrationsByKeyHash.delete(hash));
    // Clear allowedOrigins map because we don't know which origins this integration had
    this.allowedOrigins.clear();
  }

  public clear(): void {
    this.integrationsByKeyHash.clear();
    this.integrationsById.clear();
    this.tenantsById.clear();
    this.allowedOrigins.clear();
  }
}

export const sdkIntegrationCache = new SdkIntegrationCache();
