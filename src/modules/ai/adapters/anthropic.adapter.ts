import type {
  ILlmProviderAdapter,
  LlmExecutionOptions,
  LlmMessage,
  LlmNormalizedResponse,
} from "./base.adapter.js";
import logger from "../../../lib/logger.js";

export class AnthropicAdapter implements ILlmProviderAdapter {
  public async execute(
    messages: LlmMessage[],
    options: LlmExecutionOptions,
  ): Promise<LlmNormalizedResponse> {
    const apiKey = options.userApiKey?.trim();
    if (!apiKey) {
      throw new Error(
        "Anthropic API key is missing. Please configure your API key in Settings.",
      );
    }

    const model = options.modelId || "claude-3-5-sonnet";
    let url = options.baseUrl?.trim() || "https://api.anthropic.com/v1";
    url = `${url.replace(/\/$/, "")}/messages`;

    const systemMsg = messages.find(
      (m) => m.role === "system" || m.role === "developer",
    )?.content;
    const userMsgs = messages
      .filter((m) => m.role !== "system" && m.role !== "developer")
      .map((m) => ({
        role:
          m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      messages: userMsgs,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.2,
      top_p: options.topP ?? 1.0,
    };

    if (systemMsg) {
      body.system = systemMsg;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      logger.error(`Anthropic API Error (${response.status}): ${errText}`);
      throw new Error(
        `Anthropic execution failed (${response.status}): ${errText || response.statusText}`,
      );
    }

    const json = (await response.json()) as any;
    const content = json.content?.[0]?.text || "";
    const usage = json.usage || {};

    const inputTokens =
      usage.input_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = usage.output_tokens ?? Math.ceil(content.length / 4);
    const cachedTokens = usage.cache_read_input_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

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
