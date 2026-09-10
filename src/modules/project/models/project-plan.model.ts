import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

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

export interface IProjectPlanDocument extends IProjectPlan, Document {}

const projectPlanSchema = new Schema<IProjectPlanDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    version: { type: Number, default: 1, required: true },
    status: {
      type: String,
      enum: ["DRAFT_REVIEW", "APPROVED", "SUPERSEDED"],
      default: "DRAFT_REVIEW",
      required: true,
      index: true,
    },
    systemGoal: { type: String, required: true },
    coreWorkflow: [{ type: String }],
    actors: [
      {
        name: { type: String, required: true },
        type: {
          type: String,
          enum: ["HUMAN", "SYSTEM", "EXTERNAL_SERVICE"],
          required: true,
        },
        responsibilities: [{ type: String }],
        permissions: [{ type: String }],
      },
    ],
    modules: [
      {
        name: { type: String, required: true },
        purpose: { type: String, required: true },
        features: [
          {
            name: { type: String, required: true },
            description: { type: String, required: true },
            purpose: { type: String },
            actors: [{ type: String }],
            userFlow: [{ type: String }],
            backendRequirements: [{ type: String }],
            frontendRequirements: [{ type: String }],
            databaseRequirements: [{ type: String }],
            apiRequirements: [{ type: String }],
            validation: [{ type: String }],
            authorization: [{ type: String }],
            errorHandling: [{ type: String }],
            acceptanceCriteria: [{ type: String }],
            estimatedHours: { type: Number, default: 8 },
          },
        ],
      },
    ],
    dependencies: [
      {
        sourceFeature: { type: String, required: true },
        targetFeature: { type: String, required: true },
        type: {
          type: String,
          enum: ["BLOCKING", "EXTERNAL", "OPTIONAL"],
          required: true,
        },
        description: { type: String },
      },
    ],
    risks: [
      {
        title: { type: String, required: true },
        type: {
          type: String,
          enum: [
            "TECHNICAL",
            "INTEGRATION",
            "REQUIREMENTS",
            "TIMELINE",
            "SCALABILITY",
          ],
          required: true,
        },
        severity: {
          type: String,
          enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          required: true,
        },
        mitigation: { type: String, required: true },
      },
    ],
    timeline: {
      totalEngineeringHours: { type: Number, required: true },
      totalEngineeringDays: { type: Number, required: true },
      estimatedCalendarWeeks: { type: Number, required: true },
      confidence: {
        type: String,
        enum: ["LOW", "MEDIUM", "HIGH"],
        default: "MEDIUM",
      },
      assumptions: [{ type: String }],
      milestones: [
        {
          name: { type: String, required: true },
          description: { type: String },
          estimatedHours: { type: Number, required: true },
          epicNames: [{ type: String }],
        },
      ],
    },
    revisions: [
      {
        revisionNumber: { type: Number, required: true },
        changeRequest: { type: String },
        delta: { type: Schema.Types.Mixed },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    approvedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

projectPlanSchema.index({ projectId: 1, version: -1 });

export default model<IProjectPlanDocument>("ProjectPlan", projectPlanSchema);
