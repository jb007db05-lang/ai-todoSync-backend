import { Response } from "express";
import crypto from "crypto";
import { AuthenticatedRequest } from "../../../types/auth.js";
import {
  listCompanionDevicesByUser,
  countActiveCompanionDevices,
  revokeCompanionDevice,
  updateCompanionDevice,
} from "../../../modules/ai/repositories/companion-device.repository.js";
import { createCompanionKey } from "../../../modules/ai/repositories/companion-key.repository.js";
import { deterministicHash } from "../../../utils/encryption.js";
import { AppError } from "../../../utils/app-error.js";

export const getCompanionDevices = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  if (!req.user?._id) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const userId = req.user._id.toString();
  const devices = await listCompanionDevicesByUser(userId);

  const formattedDevices = devices.map((d) => ({
    id: d._id.toString(),
    deviceName: d.deviceName,
    deviceType: d.deviceType,
    status: d.status,
    createdAt: d.createdAt?.toISOString(),
    updatedAt: d.updatedAt?.toISOString(),
    revokedAt: d.revokedAt ? d.revokedAt.toISOString() : null,
  }));

  res.status(200).json({
    message: "Companion devices fetched successfully",
    data: { devices: formattedDevices },
  });
};

export const generateCompanionKey = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  if (!req.user?._id) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const userId = req.user._id.toString();
  const rawKey = `cmp_${crypto.randomBytes(16).toString("hex")}`;
  const keyHash = deterministicHash(rawKey);

  await createCompanionKey({
    userId,
    keyHash,
    deviceName: "Companion App Device",
    deviceType: "mobile",
  });

  const activeCount = await countActiveCompanionDevices(userId);

  res.status(201).json({
    message: "Companion pairing key generated successfully",
    data: {
      key: rawKey,
      maxCompanionDevices: 5,
      activeCompanionDevices: activeCount,
    },
  });
};

export const updateCompanionDeviceHandler = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  if (!req.user?._id) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const userId = req.user._id.toString();
  const deviceId = req.params.deviceId as string;
  const { deviceName, deviceType } = req.body as {
    deviceName?: string;
    deviceType?: string;
  };

  const updated = await updateCompanionDevice(userId, deviceId, {
    ...(deviceName && { deviceName }),
    ...(deviceType && { deviceType }),
  });

  if (!updated) {
    throw new AppError(404, "Companion device not found", "NOT_FOUND");
  }

  res.status(200).json({
    message: "Companion device updated successfully",
    data: {
      device: {
        id: updated._id.toString(),
        deviceName: updated.deviceName,
        deviceType: updated.deviceType,
        status: updated.status,
      },
    },
  });
};

export const revokeCompanionDeviceHandler = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  if (!req.user?._id) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }

  const userId = req.user._id.toString();
  const deviceId = req.params.deviceId as string;

  const revoked = await revokeCompanionDevice(userId, deviceId, new Date());

  if (!revoked) {
    throw new AppError(404, "Companion device not found", "NOT_FOUND");
  }

  res.status(200).json({
    message: "Companion device revoked successfully",
  });
};
