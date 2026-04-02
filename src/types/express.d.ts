import type { ICompanionDeviceDocument } from "../models/companion-device.model.js";
import type { IDeviceSessionDocument } from "../models/device-session.model.js";
import type { IUserDocument } from "../models/user.model.js";
import type { SessionDeviceContext } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
      auth?: SessionDeviceContext;
      deviceSession?: IDeviceSessionDocument | null;
      companionDevice?: ICompanionDeviceDocument | null;
    }
  }
}

export {};
