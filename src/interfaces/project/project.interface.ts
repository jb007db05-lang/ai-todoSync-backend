import type { Types } from "mongoose";

export interface IProjectCustomField {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  options?: string[];
}

export interface IProject {
  name: string;
  description?: string;
  userId: Types.ObjectId | string;
  workspaceId?: Types.ObjectId | string | null;
  icon?: string;
  color?: string;
  startDate?: Date | null;
  targetDate?: Date | null;
  status?: "ACTIVE" | "PLANNING" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  tags?: string[];
  customFields?: IProjectCustomField[];
  isArchived?: boolean;
  ai?: IProjectAi;
  audit?: IProjectAudit;
  states?: IProjectState[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProjectRole = "ADMIN" | "MEMBER";

export interface IProjectMember {
  projectId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProjectStateCategory =
  | "BACKLOG"
  | "UNSTARTED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELED";

export interface IProjectState {
  _id?: any;
  name: string;
  description?: string;
  color: string;
  position: number;
  category: ProjectStateCategory;
  isDefault?: boolean;
  isTerminal?: boolean;
}

export interface IProjectAi {
  enabled: boolean;
  provider: "gemini" | "openai" | "anthropic";
  apiKey?: string | null;
  baseUrl?: string;
  modelName: string;
}

export interface IProjectAudit {
  retentionDays: number;
  legalHold: boolean;
  updatedBy?: Types.ObjectId | string | null;
}

export interface IActorDefinition {
  name: string;
  type: "HUMAN" | "SYSTEM" | "EXTERNAL_SERVICE";
  responsibilities: string[];
  permissions?: string[];
}

export interface IFeatureSpecification {
  name: string;
  description: string;
  purpose: string;
  actors: string[];
  userFlow?: string[];
  backendRequirements?: string[];
  frontendRequirements?: string[];
  databaseRequirements?: string[];
  apiRequirements?: string[];
  validation?: string[];
  authorization?: string[];
  errorHandling?: string[];
  acceptanceCriteria: string[];
  estimatedHours: number;
}

export interface IModuleDefinition {
  name: string;
  purpose: string;
  features: IFeatureSpecification[];
}

export interface IDependencyDefinition {
  sourceFeature: string;
  targetFeature: string;
  type: "BLOCKING" | "EXTERNAL" | "OPTIONAL";
  description?: string;
}

export interface IRiskDefinition {
  title: string;
  type:
    | "TECHNICAL"
    | "INTEGRATION"
    | "REQUIREMENTS"
    | "TIMELINE"
    | "SCALABILITY";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  mitigation: string;
}

export interface ITimelineEstimate {
  totalEngineeringHours: number;
  totalEngineeringDays: number;
  estimatedCalendarWeeks: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  assumptions: string[];
  milestones: Array<{
    name: string;
    description?: string;
    estimatedHours: number;
    epicNames: string[];
  }>;
}

export interface IPlanDelta {
  addedFeatures: string[];
  removedFeatures: string[];
  modifiedFeatures: string[];
  timelineDeltaHours: number;
  summary: string;
}

export interface IProjectPlanRevision {
  revisionNumber: number;
  changeRequest?: string;
  delta?: IPlanDelta;
  createdAt: Date;
}

export interface IProjectPlan {
  projectId?: Types.ObjectId | string | null;
  workspaceId?: Types.ObjectId | string | null;
  version: number;
  status: "DRAFT_REVIEW" | "APPROVED" | "SUPERSEDED";
  systemGoal: string;
  coreWorkflow: string[];
  actors: IActorDefinition[];
  modules: IModuleDefinition[];
  dependencies: IDependencyDefinition[];
  risks: IRiskDefinition[];
  timeline: ITimelineEstimate;
  revisions?: IProjectPlanRevision[];
  approvedAt?: Date | null;
  createdBy: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Legacy interface — project AI config is now embedded in IProject.ai */
export interface IProjectAiConfig {
  projectId: Types.ObjectId | string;
  workspaceId?: Types.ObjectId | string;
  customTechStack?: string[];
  codingConventions?: string[];
  architecturalRules?: string[];
  prohibitedDependencies?: string[];
  customInstructions?: string;
  updatedBy?: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}
