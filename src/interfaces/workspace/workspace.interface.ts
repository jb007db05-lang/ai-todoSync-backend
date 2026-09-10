import type { Types } from "mongoose";

export interface IWorkspaceSettings {
  defaultProjectRole?: string;
  allowGuestInvites?: boolean;
}

export interface IWorkspace {
  name: string;
  slug: string;
  ownerId: Types.ObjectId | string;
  settings?: IWorkspaceSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IWorkspaceMember {
  workspaceId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IInvitation {
  workspaceId: Types.ObjectId | string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  invitedBy: Types.ObjectId | string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
