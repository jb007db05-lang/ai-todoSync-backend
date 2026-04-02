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
