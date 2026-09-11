import type {
  ILlmProviderAdapter,
  LlmExecutionOptions,
  LlmMessage,
  LlmNormalizedResponse,
} from "./base.adapter.js";
import logger from "../../../lib/logger.js";

export class GenericOpenAIAdapter implements ILlmProviderAdapter {
  public async execute(
    messages: LlmMessage[],
    options: LlmExecutionOptions,
  ): Promise<LlmNormalizedResponse> {
    const apiKey = options.userApiKey?.trim() || "dummy-key";
    const model = options.modelId || "llama-3.3-70b";
    let url = options.baseUrl?.trim() || "https://api.groq.com/openai/v1";
    url = `${url.replace(/\/$/, "")}/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role === "developer" ? "system" : m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP ?? 1.0,
    };

    if (options.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.error(`Generic OpenAI API Error (${response.status}): ${errText}`);
      throw new Error(
        `LLM execution failed (${response.status}): ${errText || response.statusText}`,
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
