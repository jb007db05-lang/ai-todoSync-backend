import type {
  ILlmProviderAdapter,
  LlmExecutionOptions,
  LlmMessage,
  LlmNormalizedResponse,
} from "./base.adapter.js";
import logger from "../../../lib/logger.js";

export class GeminiAdapter implements ILlmProviderAdapter {
  public async execute(
    messages: LlmMessage[],
    options: LlmExecutionOptions,
  ): Promise<LlmNormalizedResponse> {
    const apiKey = options.userApiKey?.trim();
    if (!apiKey) {
      throw new Error(
        "Google Gemini API key is missing. Please configure your API key in Settings.",
      );
    }

    const model = options.modelId || "gemini-3.6-flash";
    let url =
      options.baseUrl?.trim() ||
      "https://generativelanguage.googleapis.com/v1beta/openai";
    url = `${url.replace(/\/$/, "")}/chat/completions?key=${encodeURIComponent(apiKey)}`;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role === "developer" ? "system" : m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP ?? 0.95,
    };

    if (options.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.error(`Gemini API Error (${response.status}): ${errText}`);
      throw new Error(
        `Gemini execution failed (${response.status}): ${errText || response.statusText}`,
      );
    }

    const json = (await response.json()) as any;
    const content = json.choices?.[0]?.message?.content || "";
    const usage = json.usage || {};

    const inputTokens =
      usage.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens =
      usage.completion_tokens ?? Math.ceil(content.length / 4);
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

    return {
      content,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens,
      rawResponse: json,
    };
  }
}
