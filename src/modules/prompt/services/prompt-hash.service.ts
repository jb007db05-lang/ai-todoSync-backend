import crypto from "crypto";
import type {
  IPromptMessage,
  IPromptVariable,
} from "../../../interfaces/prompt/prompt.interface.js";

export class PromptHashService {
  /**
   * Generate canonical SHA-256 content hash for version immutability verification (F-06)
   */
  public generateCanonicalHash(
    body: string,
    messages: IPromptMessage[] = [],
    variables: IPromptVariable[] = [],
    provider?: string,
    modelName?: string,
    parameters?: any,
  ): string {
    const sortedMessages = (messages || []).map((m) => ({
      content: (m.content || "").trim(),
      role: m.role,
    }));

    const sortedVars = [...(variables || [])]
      .map((v) => ({
        defaultValue: (v.defaultValue || "").trim(),
        description: (v.description || "").trim(),
        max: v.max !== undefined ? v.max : null,
        min: v.min !== undefined ? v.min : null,
        name: (v.name || "").trim(),
        options: v.options ? [...v.options].map((o) => o.trim()).sort() : [],
        regex: v.regex || null,
        required: v.required ?? true,
        type: v.type || "string",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const canonicalObj = {
      body: (body || "").trim(),
      messages: sortedMessages,
      variables: sortedVars,
      provider: provider || "gemini",
      modelName: modelName || "gemini-3.6-flash",
      parameters: parameters || {
        temperature: 0.7,
        maxTokens: 2048,
        topP: 0.95,
        responseFormat: "text",
      },
    };

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(canonicalObj))
      .digest("hex");
  }

  /**
   * Generate clean slug from prompt name
   */
  public generateSlug(name: string): string {
    const clean = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50);
    return clean || "prompt";
  }
}

export default new PromptHashService();
