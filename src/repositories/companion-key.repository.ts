import CompanionKeyModel, {
  ICompanionKeyDocument,
} from "../models/companion-key.model.js";

interface CreateCompanionKeyPayload {
  userId: string;
  keyHash: string;
  deviceName?: string | null;
  deviceType?: string | null;
}

export const createCompanionKey = async (
  payload: CreateCompanionKeyPayload,
): Promise<ICompanionKeyDocument> => CompanionKeyModel.create(payload);

export const consumeCompanionKey = async (
  keyHash: string,
  now: Date,
): Promise<ICompanionKeyDocument | null> =>
  CompanionKeyModel.findOneAndUpdate(
    {
      keyHash,
      isUsed: false,
    },
    {
      isUsed: true,
      usedAt: now,
    },
    { new: true },
  ).exec();

export const deleteUsedCompanionKeys = async (
  userId: string,
): Promise<void> => {
  await CompanionKeyModel.deleteMany({
    userId,
    isUsed: true,
  }).exec();
};

export const listUnusedCompanionKeysByUser = async (
  userId: string,
): Promise<ICompanionKeyDocument[]> =>
  CompanionKeyModel.find({
    userId,
    isUsed: false,
  })
    .sort({ createdAt: -1 })
    .exec();

export const deleteCompanionKeyById = async (
  userId: string,
  keyId: string,
): Promise<ICompanionKeyDocument | null> =>
  CompanionKeyModel.findOneAndDelete({
    _id: keyId,
    userId,
    isUsed: false,
  }).exec();

export const updateCompanionKeyById = async (
  userId: string,
  keyId: string,
  updates: Partial<Pick<ICompanionKeyDocument, "deviceName" | "deviceType">>,
): Promise<ICompanionKeyDocument | null> =>
  CompanionKeyModel.findOneAndUpdate(
    { _id: keyId, userId, isUsed: false },
    updates,
    { new: true, runValidators: true },
  ).exec();
