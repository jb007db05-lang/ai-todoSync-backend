import type { Types } from "mongoose";

export type CompanionDeviceStatus = "active" | "revoked";

export interface ICompanionDevice {
  userId: Types.ObjectId | string;
  deviceName: string;
  deviceType: string;
  slot: number;
  status: CompanionDeviceStatus;
  revokedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICompanionKey {
  userId: Types.ObjectId | string;
  keyHash: string;
  deviceName?: string | null;
  deviceType?: string | null;
  isUsed: boolean;
  usedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
