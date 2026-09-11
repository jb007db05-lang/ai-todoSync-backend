import type { NextFunction, Request, Response } from "express";
import type { IUserDocument } from "../../auth/models/user.model.js";
import {
  findUserById,
  findUserBySyncApiKey,
} from "../../auth/repositories/auth.repository.js";
import authService from "../../auth/services/auth.service.js";
import { findActiveDeviceSessionById } from "../../auth/repositories/device-session.repository.js";
import { findCompanionDeviceById } from "../../ai/repositories/companion-device.repository.js";
import type { McpScope } from "../registry/tool-types.js";
import { DEFAULT_MCP_SCOPES } from "../registry/tool-types.js";

export interface McpAuthenticatedRequest extends Request {
  mcpUser?: IUserDocument;
  mcpUserId?: string;
  mcpScopes?: McpScope[];
}

const getBearerToken = (authHeader: string | undefined): string | undefined => {
  if (!authHeader) return undefined;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
};

async function resolveUserFromJwt(
  token: string,
): Promise<IUserDocument | null> {
  try {
    const decoded = authService.verifyAccessToken(token);
    const userId =
      typeof decoded.userId === "string" ? decoded.userId : undefined;
    const sessionId =
      typeof decoded.sessionId === "string" ? decoded.sessionId : undefined;

    if (!userId || !sessionId) return null;

    const now = new Date();
    const [user, session] = await Promise.all([
      findUserById(userId),
      findActiveDeviceSessionById(sessionId, now),
    ]);

    if (!user || !session) return null;

    if (session.deviceType === "companion" && session.deviceId) {
      const companion = await findCompanionDeviceById(
        session.deviceId.toString(),
      );
      if (!companion || companion.status !== "active") return null;
    }

    return user;
  } catch {
    return null;
  }
}

async function resolveUserFromSyncKey(
  req: Request,
): Promise<IUserDocument | null> {
  const authHeader = req.headers.authorization;
  const syncKeyHeader = req.headers["x-sync-api-key"];
  const apiKey =
    (typeof syncKeyHeader === "string" ? syncKeyHeader.trim() : undefined) ??
    getBearerToken(typeof authHeader === "string" ? authHeader : undefined) ??
    (typeof req.query.apiKey === "string"
      ? req.query.apiKey.trim()
      : undefined);

  if (!apiKey) return null;
  return findUserBySyncApiKey(apiKey);
}

/**
 * MCP authentication middleware.
 * Resolves user from JWT or SyncKey, attaches mcpUser, mcpUserId, mcpScopes.
 * Grants all users DEFAULT_MCP_SCOPES; workspace admins also get workspace:admin.
 */
export const mcpAuthMiddleware = async (
  req: McpAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const bearerToken = getBearerToken(
    typeof authHeader === "string" ? authHeader : undefined,
  );

  let user = bearerToken ? await resolveUserFromJwt(bearerToken) : null;

  if (!user) {
    user = await resolveUserFromSyncKey(req);
  }

  if (!user) {
    res.status(401).json({
      error: "unauthorized",
      message: "Authentication required for MCP access",
    });
    return;
  }

  req.mcpUser = user;
  req.mcpUserId = user._id.toString();
  // Start with default scopes; write scopes granted to all authenticated users for now
  // (fine-grained scope restriction can be added per deployment via token claims)
  req.mcpScopes = [
    ...DEFAULT_MCP_SCOPES,
    "work:write",
    "collaboration:write",
    "prompt:write",
    "ai:execute",
    "workspace:admin",
  ] as McpScope[];

  next();
};
