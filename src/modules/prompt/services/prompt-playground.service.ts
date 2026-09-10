import PromptLibraryModel from "../models/prompt-library.model.js";
import PromptVersionModel from "../models/prompt-version.model.js";
import promptAuthorizationService from "./prompt-authorization.service.js";
import promptVariableService from "./prompt-variable.service.js";
import workspaceService from "../../workspace/services/workspace.service.js";
import aiService, {
  AIServiceMessage,
} from "../../ai/services/ai/ai.service.js";
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
        isArchived: false,
      }).lean();

      if (!promptDoc) {
        throw new HttpError(404, "Prompt template not found.");
      }

      await promptAuthorizationService.assertPromptAccess(
        promptDoc,
        userId,
        workspaceId,
      );

      templateBody = promptDoc.body || "";
      templateMessages = (promptDoc.messages as IPromptMessage[]) || [];
      promptVariables = (promptDoc.variables as IPromptVariable[]) || [];
      versionNum = versionNum || promptDoc.version;

      if (payload.versionNumber) {
        const versionDoc = await PromptVersionModel.findOne({
          promptId: payload.promptId,
          version: payload.versionNumber,
        }).lean();

        if (versionDoc) {
          templateBody = versionDoc.body || "";
          templateMessages = (versionDoc.messages as IPromptMessage[]) || [];
          promptVariables = (versionDoc.variables as IPromptVariable[]) || [];
          versionNum = versionDoc.version;
        }
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

    const target =
      templateMessages.length > 0 ? templateMessages : templateBody;
    const resolved = promptVariableService.substituteVariables(
      target,
      syncedVariables,
      suppliedValues,
    );

    let aiMessages: AIServiceMessage[] = [];
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
    const temperature = payload.parameters?.temperature ?? 0.7;
    const maxTokens = payload.parameters?.maxTokens ?? 2048;

    const startTime = Date.now();

    let output = "";
    try {
      output = await aiService.generate(aiMessages, {
        provider: selectedProvider,
        modelName: selectedModel,
        temperature,
        maxTokens,
      });
    } catch (err: any) {
      const msg = err?.message || "Failed to execute prompt with AI provider.";
      throw new HttpError(502, `Playground Execution Error: ${msg}`);
    }

    const latencyMs = Date.now() - startTime;

    const inputCharCount = Array.isArray(resolved)
      ? resolved.reduce((acc, m) => acc + m.content.length, 0)
      : (resolved as string).length;
    const outputCharCount = output.length;
    const inputTokens = Math.ceil(inputCharCount / 4);
    const outputTokens = Math.ceil(outputCharCount / 4);
    const totalTokens = inputTokens + outputTokens;

    return {
      output,
      resolvedPrompt: resolved as string | IPromptMessage[],
      metadata: {
        modelName: selectedModel,
        provider: selectedProvider,
        latencyMs,
        inputTokens,
        outputTokens,
        totalTokens,
        timestamp: new Date().toISOString(),
        promptId: payload.promptId,
        versionNumber: versionNum,
      },
    };
  }
}

export default new PromptPlaygroundService();
