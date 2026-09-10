import QRPairingSessionModel, {
  IQRPairingSessionDocument,
} from "../models/qr-pairing-session.model.js";

export const createQRPairingSession = async (data: {
  sessionId: string;
  userId: string;
  workspaceId?: string | null;
  qrToken: string;
  expiresAt: Date;
}): Promise<IQRPairingSessionDocument> => {
  return QRPairingSessionModel.create(data);
};

export const findQRPairingSessionBySessionId = async (
  sessionId: string,
): Promise<IQRPairingSessionDocument | null> => {
  return QRPairingSessionModel.findOne({ sessionId });
};

export const findValidQRPairingSession = async (
  sessionId: string,
  qrToken: string,
  now: Date = new Date(),
): Promise<IQRPairingSessionDocument | null> => {
  return QRPairingSessionModel.findOne({
    sessionId,
    qrToken,
    isUsed: false,
    status: "pending",
    expiresAt: { $gt: now },
  });
};

export const consumeQRPairingSession = async (
  sessionId: string,
  qrToken: string,
  now: Date = new Date(),
): Promise<IQRPairingSessionDocument | null> => {
  return QRPairingSessionModel.findOneAndUpdate(
    {
      sessionId,
      qrToken,
      isUsed: false,
      status: "pending",
      expiresAt: { $gt: now },
    },
    {
      $set: {
        isUsed: true,
        usedAt: now,
        status: "paired",
      },
    },
    { new: true },
  );
};
