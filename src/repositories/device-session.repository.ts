import DeviceSessionModel, {
  IDeviceSession,
  IDeviceSessionDocument,
} from "../models/device-session.model.js";

export const createDeviceSession = async (
  payload: IDeviceSession,
): Promise<IDeviceSessionDocument> => DeviceSessionModel.create(payload);

export const findDeviceSessionById = async (
  sessionId: string,
): Promise<IDeviceSessionDocument | null> =>
  DeviceSessionModel.findById(sessionId).exec();

export const findActiveDeviceSessionById = async (
  sessionId: string,
  now: Date,
): Promise<IDeviceSessionDocument | null> =>
  DeviceSessionModel.findOne({
    _id: sessionId,
    revokedAt: null,
    expiresAt: { $gt: now },
  }).exec();

export const updateDeviceSessionRefreshToken = async (
  sessionId: string,
  refreshTokenHash: string,
  expiresAt: Date,
  rotatedAt: Date,
): Promise<IDeviceSessionDocument | null> =>
  DeviceSessionModel.findOneAndUpdate(
    {
      _id: sessionId,
      revokedAt: null,
    },
    {
      refreshTokenHash,
      expiresAt,
      lastRotatedAt: rotatedAt,
      lastUsedAt: rotatedAt,
    },
    { new: true },
  ).exec();

export const touchDeviceSession = async (
  sessionId: string,
  now: Date,
): Promise<void> => {
  await DeviceSessionModel.updateOne(
    { _id: sessionId },
    { lastUsedAt: now },
  ).exec();
};

export const revokeDeviceSession = async (
  sessionId: string,
  revokedAt: Date,
): Promise<void> => {
  await DeviceSessionModel.updateOne({ _id: sessionId }, { revokedAt }).exec();
};

export const revokeDeviceSessionsByDeviceId = async (
  deviceId: string,
  revokedAt: Date,
): Promise<void> => {
  await DeviceSessionModel.updateMany(
    { deviceId, revokedAt: null },
    { revokedAt },
  ).exec();
};

export const revokeSessionsByUserAndDevice = async (
  userId: string,
  deviceId: string | null,
  deviceType: IDeviceSession["deviceType"],
  revokedAt: Date,
): Promise<void> => {
  await DeviceSessionModel.updateMany(
    {
      userId,
      deviceId,
      deviceType,
      revokedAt: null,
    },
    { revokedAt },
  ).exec();
};

export const countActiveSessionsForDevice = async (
  deviceId: string,
): Promise<number> =>
  DeviceSessionModel.countDocuments({ deviceId, revokedAt: null }).exec();
