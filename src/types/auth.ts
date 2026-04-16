import type { Request } from "express";

import type { ICompanionDeviceDocument } from "../models/companion-device.model.js";
import type {
  IDeviceSessionDocument,
  SessionDeviceKind,
} from "../models/device-session.model.js";
import type { IProjectDocument } from "../models/project.model.js";
import type { ProjectRole } from "../models/project-member.model.js";
import type { IUserDocument } from "../models/user.model.js";

export interface AuthProfile {
  id: string;
  email: string;
  syncApiKey: string;
  name: string | null;
  authProvider: "local" | "google";
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
