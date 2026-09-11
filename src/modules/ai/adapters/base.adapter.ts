export interface LlmMessage {
  role: "system" | "user" | "assistant" | "developer";
  content: string;
}

export interface LlmExecutionOptions {
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  responseFormat?: "text" | "json";
  userApiKey?: string;
  baseUrl?: string;
}

export interface LlmNormalizedResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  rawResponse?: unknown;
}

export interface ILlmProviderAdapter {
  execute(
    messages: LlmMessage[],
    options: LlmExecutionOptions,
  ): Promise<LlmNormalizedResponse>;
}
