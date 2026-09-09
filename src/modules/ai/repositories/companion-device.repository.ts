import CompanionDeviceModel, {
  ICompanionDevice,
  ICompanionDeviceDocument,
} from "../../../modules/ai/models/companion-device.model.js";

export const createCompanionDevice = async (
  payload: ICompanionDevice,
): Promise<ICompanionDeviceDocument> => CompanionDeviceModel.create(payload);

export const countActiveCompanionDevices = async (
  userId: string,
): Promise<number> =>
  CompanionDeviceModel.countDocuments({ userId, status: "active" }).exec();

export const findCompanionDeviceById = async (
  deviceId: string,
): Promise<ICompanionDeviceDocument | null> =>
  CompanionDeviceModel.findById(deviceId).exec();

export const findCompanionDeviceByIdForUser = async (
  userId: string,
  deviceId: string,
): Promise<ICompanionDeviceDocument | null> =>
  CompanionDeviceModel.findOne({ _id: deviceId, userId }).exec();

export const listCompanionDevicesByUser = async (
  userId: string,
): Promise<ICompanionDeviceDocument[]> =>
  CompanionDeviceModel.find({ userId, status: "active" })
    .sort({ updatedAt: -1, createdAt: -1 })
    .exec();

export const revokeCompanionDevice = async (
  userId: string,
  deviceId: string,
  revokedAt: Date,
): Promise<ICompanionDeviceDocument | null> =>
  CompanionDeviceModel.findOneAndUpdate(
    { _id: deviceId, userId, status: "active" },
    { status: "revoked", revokedAt },
    { new: true },
  ).exec();

export const updateCompanionDevice = async (
  userId: string,
  deviceId: string,
  updates: Partial<Pick<ICompanionDevice, "deviceName" | "deviceType">>,
): Promise<ICompanionDeviceDocument | null> =>
  CompanionDeviceModel.findOneAndUpdate({ _id: deviceId, userId }, updates, {
    new: true,
    runValidators: true,
  }).exec();
