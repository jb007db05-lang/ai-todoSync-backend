import type { Types } from "mongoose";

export const PROMPT_CATEGORIES = [
  "general",
  "development",
  "backend",
  "frontend",
  "database",
  "ui-ux",
  "documentation",
  "testing",
  "devops",
  "deployment",
  "ai",
  "security",
  "performance",
  "custom",
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export const PROMPT_VISIBILITIES = [
  "private",
  "project",
  "organization",
] as const;
export type PromptVisibility = (typeof PROMPT_VISIBILITIES)[number];

export interface IPromptMessage {
  role: "system" | "developer" | "user" | "assistant";
  content: string;
}

export interface IPromptVariable {
  name: string;
  type?: "string" | "number" | "json" | "boolean" | "enum";
  description?: string;
  defaultValue?: string;
  required: boolean;
  options?: string[]; // for enum type
  min?: number;
  max?: number;
  regex?: string;
}

export interface IPromptLibrary {
  workspaceId?: Types.ObjectId | string | null;
  projectId?: Types.ObjectId | string | null;
  folderId?: Types.ObjectId | string | null;
  name: string;
  slug?: string;
  description: string;
  category: PromptCategory;
  tags: string[];
  body: string; // fallback string representation
  messages?: IPromptMessage[]; // multi-role block support
  variables: IPromptVariable[];
  parameters?: {
    provider?: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  visibility: PromptVisibility;
  createdBy: Types.ObjectId | string;
  version: number;
  hash?: string; // SHA-256 canonical hash
  isLatest: boolean;
  parentId?: Types.ObjectId | string | null; // points to root prompt for versions
  isFavorite: boolean;
  isArchived: boolean;
  isTemplate: boolean; // built-in starter template
  usageCount: number;
  lastUsedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptFolder {
  workspaceId: Types.ObjectId | string;
  name: string;
  description?: string;
  parentId?: Types.ObjectId | string | null;
  createdBy: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptVersion {
  promptId: Types.ObjectId | string;
  version: number;
  hash: string;
  body: string;
  messages?: IPromptMessage[];
  variables?: IPromptVariable[];
  parameters?: {
    provider?: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  changedBy: Types.ObjectId | string;
  changeNote?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const PROMPT_DEPLOYMENT_ACTIONS = [
  "set-production",
  "start-canary",
  "update-canary",
  "promote-canary",
  "abort-canary",
  "rollback",
  "bind-feature",
  "unbind-feature",
] as const;
export type PromptDeploymentAction = (typeof PROMPT_DEPLOYMENT_ACTIONS)[number];

export interface IPromptDeploymentEvent {
  action: PromptDeploymentAction;
  version?: number | null;
  previousVersion?: number | null;
  percentage?: number | null;
  featureKey?: string | null;
  actor: Types.ObjectId | string;
  at: Date;
}

export interface IPromptCanary {
  version: number;
  percentage: number; // 1-99, share of users routed to the canary
  startedAt: Date;
}

export const PROMPT_VERSION_STATUSES = [
  "production",
  "canary",
  "staging",
  "draft",
] as const;
export type PromptVersionStatus = (typeof PROMPT_VERSION_STATUSES)[number];

/**
 * Deployment state of one logical prompt (keyed by its root prompt id).
 * Exactly one version is in production. When another version replaces it
 * (direct deploy, canary promotion or rollback), the replaced version moves
 * to `stagingVersion`, the one-step rollback target. `canary`, when set,
 * receives `percentage`% of users (sticky per user).
 */
export interface IPromptDeployment {
  workspaceId: Types.ObjectId | string;
  promptId: Types.ObjectId | string; // root prompt id
  featureKey?: string | null;
  productionVersion: number;
  stagingVersion?: number | null;
  canary?: IPromptCanary | null;
  updatedBy: Types.ObjectId | string;
  history: IPromptDeploymentEvent[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptFavorite {
  workspaceId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  promptId: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreatePromptPayload {
  name: string;
  description?: string;
  category?: PromptCategory;
  tags?: string[];
  body: string;
  messages?: IPromptMessage[];
  variables?: IPromptVariable[];
  parameters?: {
    provider?: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  folderId?: string | null;
  projectId?: string | null;
  visibility?: PromptVisibility;
  isTemplate?: boolean;
}

export interface UpdatePromptPayload {
  name?: string;
  description?: string;
  category?: PromptCategory;
  tags?: string[];
  body?: string;
  messages?: IPromptMessage[];
  variables?: IPromptVariable[];
  parameters?: {
    provider?: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
  folderId?: string | null;
  projectId?: string | null;
  visibility?: PromptVisibility;
  changeNote?: string;
}
