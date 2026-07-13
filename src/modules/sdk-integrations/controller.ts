import type { Request, Response } from "express";
import { isAppError, AppError } from "../../utils/app-error.js";
import sdkIntegrationService from "./service.js";
import {
  validateCreate,
  validateUpdate,
} from "./validators.js";

class SdkIntegrationController {
  private tenantId(req: Request): string {
    const id = req.user?._id?.toString();
    if (!id) throw new AppError(401, "Authentication required", "AUTH_REQUIRED");
    return id;
  }

  private paramId(req: Request): string {
    const raw = req.params.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }

  /** GET /sdk-integrations */
  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const integrations = await sdkIntegrationService.listByTenant(
        this.tenantId(req),
      );
      // Never expose raw sdkKey in list — only masked
      const safeList = integrations.map((i) => this.toSafeDto(i, false));
      res.status(200).json({ data: { integrations: safeList } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** GET /sdk-integrations/:id */
  getOne = async (req: Request, res: Response): Promise<void> => {
    try {
      const integration = await sdkIntegrationService.getOne(
        this.tenantId(req),
        this.paramId(req),
      );
      if (!integration) {
        throw new AppError(404, "Integration not found", "NOT_FOUND");
      }
      res.status(200).json({ data: { integration: this.toSafeDto(integration, false) } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** POST /sdk-integrations */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto = validateCreate(req.body);
      const { integration, rawKey } = await sdkIntegrationService.create({
        tenantId: this.tenantId(req),
        ...dto,
      });
      // Show raw key ONCE on creation
      res.status(201).json({
        data: {
          integration: this.toSafeDto(integration, false),
          sdkKey: rawKey,
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** PATCH /sdk-integrations/:id */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const dto = validateUpdate(req.body);
      const integration = await sdkIntegrationService.update(
        this.tenantId(req),
        this.paramId(req),
        dto,
      );
      if (!integration) {
        throw new AppError(404, "Integration not found", "NOT_FOUND");
      }
      res.status(200).json({ data: { integration: this.toSafeDto(integration, false) } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** POST /sdk-integrations/:id/regenerate-key */
  regenerateKey = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await sdkIntegrationService.regenerateKey(
        this.tenantId(req),
        this.paramId(req),
      );
      if (!result) {
        throw new AppError(404, "Integration not found", "NOT_FOUND");
      }
      // Show new raw key once
      res.status(200).json({
        data: {
          integration: this.toSafeDto(result.integration, false),
          sdkKey: result.rawKey,
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** POST /sdk-integrations/:id/disable */
  disable = async (req: Request, res: Response): Promise<void> => {
    try {
      const integration = await sdkIntegrationService.disable(
        this.tenantId(req),
        this.paramId(req),
      );
      if (!integration) {
        throw new AppError(404, "Integration not found", "NOT_FOUND");
      }
      res.status(200).json({ data: { integration: this.toSafeDto(integration, false) } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** POST /sdk-integrations/:id/enable */
  enable = async (req: Request, res: Response): Promise<void> => {
    try {
      const integration = await sdkIntegrationService.enable(
        this.tenantId(req),
        this.paramId(req),
      );
      if (!integration) {
        throw new AppError(404, "Integration not found", "NOT_FOUND");
      }
      res.status(200).json({ data: { integration: this.toSafeDto(integration, false) } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** DELETE /sdk-integrations/:id */
  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await sdkIntegrationService.delete(
        this.tenantId(req),
        this.paramId(req),
      );
      if (!deleted) {
        throw new AppError(404, "Integration not found", "NOT_FOUND");
      }
      res.status(200).json({ data: { success: true } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  /** POST /sdk-integrations/:id/heartbeat — SDK calls this */
  heartbeat = async (req: Request, res: Response): Promise<void> => {
    try {
      const integration = req.sdkIntegration;
      if (!integration) {
        throw new AppError(401, "SDK authentication required", "AUTH_REQUIRED");
      }
      await sdkIntegrationService.touchConnection(
        integration._id.toString(),
        {
          sdkVersion: req.body?.sdkVersion as string | undefined,
          latestOrigin: req.headers.origin,
          touchHeartbeat: true,
        },
      );
      res.status(200).json({ data: { status: "ok" } });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private toSafeDto(integration: any, includeKey: boolean) {
    const obj = integration.toObject ? integration.toObject() : integration;
    return {
      id: obj._id?.toString() ?? obj.id,
      name: obj.name,
      environment: obj.environment,
      domain: obj.domain,
      applicationUrl: obj.domain,
      allowedOrigins: obj.allowedOrigins || [],
      description: obj.description,
      status: obj.status,
      sdkKeyMasked: includeKey
        ? obj.sdkKey
        : this.maskKey(obj.sdkKey),
      sdkVersion: obj.sdkVersion,
      firstConnectedAt: obj.firstConnectedAt,
      lastConnectedAt: obj.lastConnectedAt,
      lastRuntimeRequestAt: obj.lastRuntimeRequestAt,
      lastEventRequestAt: obj.lastEventRequestAt,
      lastHeartbeatAt: obj.lastHeartbeatAt,
      connectionCount: obj.connectionCount,
      latestOrigin: obj.latestOrigin,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private maskKey(key: string): string {
    if (!key || key.length < 12) return "****";
    return `${key.slice(0, 8)}...${key.slice(-4)}`;
  }

  private handleError(res: Response, error: unknown): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    console.error("SdkIntegrationController error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export default new SdkIntegrationController();
