import type { ICompanionDeviceDocument } from "../modules/ai/models/companion-device.model.js";
import type { IDeviceSessionDocument } from "../modules/auth/models/device-session.model.js";
import type { IProjectDocument } from "../modules/project/models/project.model.js";
import type { ProjectRole } from "../modules/project/models/project-member.model.js";
import type { IUserDocument } from "../modules/auth/models/user.model.js";
import type { IAnalyticsKeyDocument } from "../modules/analytics/models/analytics-key.model.js";
import type { ISdkIntegrationDocument } from "../modules/sdk-integrations/model.js";
import type { SessionDeviceContext } from "./auth.js";

interface ProjectAccessContext {
  project: IProjectDocument;
  role: ProjectRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
      auth?: SessionDeviceContext;
      deviceSession?: IDeviceSessionDocument | null;
      companionDevice?: ICompanionDeviceDocument | null;
      projectAccess?: ProjectAccessContext;
      analyticsKey?: IAnalyticsKeyDocument;
      apiKeyId?: string;
      /** Populated by validateSdkIntegrationKey / validateSdkKeyUnified */
      sdkIntegration?: ISdkIntegrationDocument;
      sdkSession?: any;
    }
  }
}

export {};
