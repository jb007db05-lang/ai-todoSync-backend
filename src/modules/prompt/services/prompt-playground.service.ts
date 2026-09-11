import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import promptVariableService from "./prompt-variable.service.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import llmExecutionService from "../../ai/services/llm-execution.service.js";
import { HttpError } from "../../../shared/errors/http-error.js";
import type {
  IPromptVariable,
  IPromptMessage,
} from "../../../interfaces/prompt/prompt.interface.js";

export interface PlaygroundRunPayload {
  promptId?: string;
  versionNumber?: number;
  body?: string;
  messages?: IPromptMessage[];
  variables?: Record<string, any>;
  modelName?: string;
  provider?: "gemini" | "openai" | "anthropic";
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}

export interface PlaygroundRunResponse {
  output: string;
  resolvedPrompt: string | IPromptMessage[];
  metadata: {
    modelName: string;
    provider: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    timestamp: string;
    promptId?: string;
    versionNumber?: number;
  };
}

export class PromptPlaygroundService {
  public async runPlayground(
    workspaceId: string,
    userId: string,
    payload: PlaygroundRunPayload,
  ): Promise<PlaygroundRunResponse> {
    await workspaceService.assertMembership(userId, workspaceId);

    let templateBody = payload.body || "";
    let templateMessages: IPromptMessage[] = payload.messages || [];
    let promptVariables: IPromptVariable[] = [];
    let versionNum = payload.versionNumber;

    if (payload.promptId) {
      const promptDoc = await PromptLibraryModel.findOne({
        _id: payload.promptId,
        workspaceId,
      });

      if (!promptDoc) {
        throw new HttpError(404, "Prompt template not found in workspace.");
      }

      await promptAuthorizationService.assertPromptAccess(
        promptDoc,
        userId,
        workspaceId,
      );

      if (versionNum) {
        const verDoc = await PromptVersionModel.findOne({
          promptId: payload.promptId,
          version: versionNum,
        });
        if (!verDoc) {
          throw new HttpError(
            404,
            `Version ${versionNum} not found for this prompt.`,
          );
        }
        templateBody = verDoc.body || "";
        templateMessages = verDoc.messages || [];
        promptVariables = verDoc.variables || [];
      } else {
        versionNum = promptDoc.version;
        templateBody = promptDoc.body || "";
        templateMessages = promptDoc.messages || [];
        promptVariables = promptDoc.variables || [];
      }
    }

    const syncedVariables = promptVariableService.syncVariables(
      templateBody,
      templateMessages,
      promptVariables,
    );

    const suppliedValues = payload.variables || {};
    promptVariableService.validateVariableValues(
      syncedVariables,
      suppliedValues,
    );

    const resolved = promptVariableService.substituteVariables(
      templateBody,
      syncedVariables,
      suppliedValues,
    );

    let aiMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];
    if (Array.isArray(resolved)) {
      aiMessages = resolved.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      }));
    } else {
      aiMessages = [{ role: "user", content: resolved as string }];
    }

    const selectedProvider = payload.provider || "gemini";
    const selectedModel = payload.modelName || "gemini-3.6-flash";

    const execResult = await llmExecutionService.execute({
      workspaceId,
      userId,
      promptId: payload.promptId || null,
      promptVersion: versionNum || null,
      source: "playground",
      messages: aiMessages,
      provider: selectedProvider,
      modelName: selectedModel,
      parameters: {
        temperature: payload.parameters?.temperature ?? 0.7,
        maxTokens: payload.parameters?.maxTokens ?? 2048,
        topP: payload.parameters?.topP ?? 0.95,
      },
    });

    return {
      output: execResult.content,
      resolvedPrompt: resolved as string | IPromptMessage[],
      metadata: {
        modelName: execResult.modelName,
        provider: execResult.provider,
        latencyMs: execResult.latencyMs,
        inputTokens: execResult.inputTokens,
        outputTokens: execResult.outputTokens,
        totalTokens: execResult.totalTokens,
        costUsd: execResult.cost.totalCost,
        timestamp: new Date().toISOString(),
        promptId: payload.promptId,
        versionNumber: versionNum,
      },
    };
  }
}

export default new PromptPlaygroundService();
