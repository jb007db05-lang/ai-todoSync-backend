import LlmProviderModel, {
  ILlmProvider,
} from "../models/llm-provider.model.js";
import LlmModelModel, { ILlmModel } from "../models/llm-model.model.js";
import logger from "../../../lib/logger.js";

const DEFAULT_PROVIDERS: ILlmProvider[] = [
  {
    providerId: "gemini",
    displayName: "Google Gemini",
    isEnabled: true,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    supportedCapabilities: ["streaming", "json", "system_messages", "vision"],
    supportedParameters: ["temperature", "maxTokens", "topP", "responseFormat"],
    sortOrder: 1,
  },
  {
    providerId: "openai",
    displayName: "OpenAI",
    isEnabled: true,
    baseUrl: "https://api.openai.com/v1",
    supportedCapabilities: [
      "streaming",
      "json",
      "system_messages",
      "tools",
      "vision",
    ],
    supportedParameters: [
      "temperature",
      "maxTokens",
      "topP",
      "frequencyPenalty",
      "presencePenalty",
      "responseFormat",
    ],
    sortOrder: 2,
  },
  {
    providerId: "anthropic",
    displayName: "Anthropic Claude",
    isEnabled: true,
    baseUrl: "https://api.anthropic.com/v1",
    supportedCapabilities: ["streaming", "system_messages", "vision", "tools"],
    supportedParameters: ["temperature", "maxTokens", "topP"],
    sortOrder: 3,
  },
  {
    providerId: "groq",
    displayName: "Groq / Local AI",
    isEnabled: true,
    baseUrl: "https://api.groq.com/openai/v1",
    supportedCapabilities: ["streaming", "json", "system_messages"],
    supportedParameters: ["temperature", "maxTokens", "topP", "responseFormat"],
    sortOrder: 4,
  },
];

const DEFAULT_MODELS: ILlmModel[] = [
  {
    modelId: "gemini-3.6-flash",
    providerId: "gemini",
    displayName: "Gemini 3.6 Flash",
    isEnabled: true,
    isDefault: true,
    contextWindow: 1048576,
    maxOutputTokens: 8192,
    inputPricePerMToken: 0.075,
    outputPricePerMToken: 0.3,
    cachedInputPricePerMToken: 0.01875,
    capabilities: ["streaming", "json", "system_messages", "vision"],
    supportedParameters: ["temperature", "maxTokens", "topP", "responseFormat"],
  },
  {
    modelId: "gemini-1.5-pro",
    providerId: "gemini",
    displayName: "Gemini 1.5 Pro",
    isEnabled: true,
    isDefault: false,
    contextWindow: 2097152,
    maxOutputTokens: 8192,
    inputPricePerMToken: 1.25,
    outputPricePerMToken: 5.0,
    cachedInputPricePerMToken: 0.3125,
    capabilities: ["streaming", "json", "system_messages", "vision"],
    supportedParameters: ["temperature", "maxTokens", "topP", "responseFormat"],
  },
  {
    modelId: "gpt-4o",
    providerId: "openai",
    displayName: "GPT-4o",
    isEnabled: true,
    isDefault: false,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputPricePerMToken: 2.5,
    outputPricePerMToken: 10.0,
    cachedInputPricePerMToken: 1.25,
    capabilities: ["streaming", "json", "system_messages", "tools", "vision"],
    supportedParameters: [
      "temperature",
      "maxTokens",
      "topP",
      "frequencyPenalty",
      "presencePenalty",
      "responseFormat",
    ],
  },
  {
    modelId: "gpt-4o-mini",
    providerId: "openai",
    displayName: "GPT-4o Mini",
    isEnabled: true,
    isDefault: false,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputPricePerMToken: 0.15,
    outputPricePerMToken: 0.6,
    cachedInputPricePerMToken: 0.075,
    capabilities: ["streaming", "json", "system_messages", "tools"],
    supportedParameters: [
      "temperature",
      "maxTokens",
      "topP",
      "frequencyPenalty",
      "presencePenalty",
      "responseFormat",
    ],
  },
  {
    modelId: "claude-3-5-sonnet",
    providerId: "anthropic",
    displayName: "Claude 3.5 Sonnet",
    isEnabled: true,
    isDefault: false,
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputPricePerMToken: 3.0,
    outputPricePerMToken: 15.0,
    cachedInputPricePerMToken: 0.3,
    capabilities: ["streaming", "system_messages", "vision", "tools"],
    supportedParameters: ["temperature", "maxTokens", "topP"],
  },
  {
    modelId: "claude-3-haiku",
    providerId: "anthropic",
    displayName: "Claude 3 Haiku",
    isEnabled: true,
    isDefault: false,
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputPricePerMToken: 0.25,
    outputPricePerMToken: 1.25,
    cachedInputPricePerMToken: 0.03,
    capabilities: ["streaming", "system_messages"],
    supportedParameters: ["temperature", "maxTokens", "topP"],
  },
  {
    modelId: "llama-3.3-70b",
    providerId: "groq",
    displayName: "Llama 3.3 70B Versatile",
    isEnabled: true,
    isDefault: false,
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputPricePerMToken: 0.59,
    outputPricePerMToken: 0.79,
    cachedInputPricePerMToken: 0.1,
    capabilities: ["streaming", "json", "system_messages"],
    supportedParameters: ["temperature", "maxTokens", "topP", "responseFormat"],
  },
];

export class LlmCatalogService {
  private isInitialized = false;

  public async initializeCatalogIfNeeded(): Promise<void> {
    if (this.isInitialized) return;
    try {
      for (const prov of DEFAULT_PROVIDERS) {
        await LlmProviderModel.updateOne(
          { providerId: prov.providerId },
          { $setOnInsert: prov },
          { upsert: true },
        );
      }

      for (const mod of DEFAULT_MODELS) {
        await LlmModelModel.updateOne(
          { modelId: mod.modelId },
          { $setOnInsert: mod },
          { upsert: true },
        );
      }

      this.isInitialized = true;
    } catch (err) {
      logger.error("Failed to seed LLM provider/model catalog", { err });
    }
  }

  public async getProviders(): Promise<ILlmProvider[]> {
    await this.initializeCatalogIfNeeded();
    return LlmProviderModel.find({ isEnabled: true })
      .sort({ sortOrder: 1 })
      .lean();
  }

  public async getModels(providerId?: string): Promise<ILlmModel[]> {
    await this.initializeCatalogIfNeeded();
    const query: Record<string, unknown> = { isEnabled: true };
    if (providerId) {
      query.providerId = providerId.toLowerCase();
    }
    return LlmModelModel.find(query).lean();
  }

  public async getModelDetails(modelId: string): Promise<ILlmModel | null> {
    await this.initializeCatalogIfNeeded();
    return LlmModelModel.findOne({ modelId, isEnabled: true }).lean();
  }

  public async getDefaultModel(): Promise<ILlmModel> {
    await this.initializeCatalogIfNeeded();
    const defaultModel = await LlmModelModel.findOne({
      isDefault: true,
      isEnabled: true,
    }).lean();
    if (defaultModel) return defaultModel;

    const firstModel = await LlmModelModel.findOne({ isEnabled: true }).lean();
    if (firstModel) return firstModel;

    return DEFAULT_MODELS[0];
  }
}

export default new LlmCatalogService();
