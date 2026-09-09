import type { Request } from "express";

import type { ICompanionDeviceDocument } from "../modules/ai/models/companion-device.model.js";
import type {
  IDeviceSessionDocument,
  SessionDeviceKind,
} from "../modules/auth/models/device-session.model.js";
import type { IProjectDocument } from "../modules/project/models/project.model.js";
import type { ProjectRole } from "../interfaces/project/project.interface.js";
import type { IUserDocument } from "../modules/auth/models/user.model.js";

export interface AuthProfile {
  id: string;
  email: string;
  syncApiKey: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  authProvider: "local" | "google";
  openaiApiKeyConfigured?: boolean;
  anthropicApiKeyConfigured?: boolean;
  geminiApiKeyConfigured?: boolean;
  twoFactorEnabled?: boolean;
}

export interface SessionDeviceContext {
  sessionId: string | null;
  deviceId: string | null;
  deviceType: SessionDeviceKind | "sync_key";
  deviceName: string | null;
  companionDeviceType: string | null;
  authMethod: "access_token" | "sync_api_key";
}

export interface AuthResult {
  token: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  syncApiKey: string;
  user: AuthProfile;
  session: SessionDeviceContext;
}

export interface AuthenticatedRequest extends Request {
  user?: IUserDocument;
  auth?: SessionDeviceContext;
  deviceSession?: IDeviceSessionDocument | null;
  companionDevice?: ICompanionDeviceDocument | null;
  projectAccess?: {
    project: IProjectDocument;
    role: ProjectRole;
  };
}
