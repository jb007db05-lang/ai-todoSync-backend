import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

export type CanaryStatus =
  | "active"
  | "paused"
  | "completed"
  | "rolled_back"
  | "failed"
  | "cancelled";

export interface ICanaryMetrics {
  totalRequests: number;
  canaryRequests: number;
  legacyRequests: number;
  canaryErrors: number;
  legacyErrors: number;
  canaryLatencyMsTotal: number;
  legacyLatencyMsTotal: number;
  canaryTokensTotal: number;
  legacyTokensTotal: number;
  canaryCostTotal: number;
  legacyCostTotal: number;
}

export interface IPromptCanaryDeployment {
  workspaceId: Types.ObjectId | string;
  promptId: Types.ObjectId | string;
  legacyVersion: number;
  candidateVersion: number;
  status: CanaryStatus;
  currentPhase: number; // 1, 2, 3, 4
  trafficWeight: {
    canary: number;
    legacy: number;
  };
  rolloutProgress: number; // 0 - 100
  minRequests: number;
  errorThreshold: number; // e.g. 0.05 (5%)
  rollbackReason?: string;
  createdBy: Types.ObjectId | string;
  metrics: ICanaryMetrics;
  startedAt: Date;
  completedAt?: Date;
  pausedAt?: Date;
  rolledBackAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPromptCanaryDeploymentDocument
  extends IPromptCanaryDeployment, Document {}

const canaryMetricsSchema = new Schema<ICanaryMetrics>(
  {
    totalRequests: { type: Number, default: 0 },
    canaryRequests: { type: Number, default: 0 },
    legacyRequests: { type: Number, default: 0 },
    canaryErrors: { type: Number, default: 0 },
    legacyErrors: { type: Number, default: 0 },
    canaryLatencyMsTotal: { type: Number, default: 0 },
    legacyLatencyMsTotal: { type: Number, default: 0 },
    canaryTokensTotal: { type: Number, default: 0 },
    legacyTokensTotal: { type: Number, default: 0 },
    canaryCostTotal: { type: Number, default: 0 },
    legacyCostTotal: { type: Number, default: 0 },
  },
  { _id: false },
);

const promptCanaryDeploymentSchema =
  new Schema<IPromptCanaryDeploymentDocument>(
    {
      workspaceId: {
        type: Schema.Types.ObjectId,
        ref: "Workspace",
        required: true,
        index: true,
      },
      promptId: {
        type: Schema.Types.ObjectId,
        ref: "PromptLibrary",
        required: true,
        index: true,
      },
      legacyVersion: { type: Number, required: true },
      candidateVersion: { type: Number, required: true },
      status: {
        type: String,
        enum: [
          "active",
          "paused",
          "completed",
          "rolled_back",
          "failed",
          "cancelled",
        ],
        default: "active",
        required: true,
        index: true,
      },
      currentPhase: { type: Number, default: 1, min: 1, max: 4 },
      trafficWeight: {
        canary: { type: Number, default: 5, min: 0, max: 100 },
        legacy: { type: Number, default: 95, min: 0, max: 100 },
      },
      rolloutProgress: { type: Number, default: 5 },
      minRequests: { type: Number, default: 10 },
      errorThreshold: { type: Number, default: 0.05 },
      rollbackReason: { type: String, default: "" },
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      metrics: {
        type: canaryMetricsSchema,
        default: () => ({
          totalRequests: 0,
          canaryRequests: 0,
          legacyRequests: 0,
          canaryErrors: 0,
          legacyErrors: 0,
          canaryLatencyMsTotal: 0,
          legacyLatencyMsTotal: 0,
          canaryTokensTotal: 0,
          legacyTokensTotal: 0,
          canaryCostTotal: 0,
          legacyCostTotal: 0,
        }),
      },
      startedAt: { type: Date, default: Date.now },
      completedAt: { type: Date, default: undefined },
      pausedAt: { type: Date, default: undefined },
      rolledBackAt: { type: Date, default: undefined },
    },
    { timestamps: true },
  );

promptCanaryDeploymentSchema.index({ promptId: 1, status: 1 });
promptCanaryDeploymentSchema.index({ workspaceId: 1, createdAt: -1 });

export default model<IPromptCanaryDeploymentDocument>(
  "PromptCanaryDeployment",
  promptCanaryDeploymentSchema,
);
