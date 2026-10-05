import logger from "../../../../lib/logger.js";
import promptResolverService, {
  type PromptScope,
} from "../../../prompt/services/prompt-resolver.service.js";

export interface AIServiceMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIServiceOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
  modelName?: string;
  provider?: "gemini" | "openai" | "anthropic";
  baseUrl?: string;
}

export interface AIProjectPlanResponse {
  name: string;
  description: string;
  systemGoal: string;
  coreWorkflow: string[];
  actors: Array<{
    name: string;
    type: "HUMAN" | "SYSTEM" | "EXTERNAL_SERVICE";
    responsibilities: string[];
    permissions?: string[];
  }>;
  suggestedStates: Array<{
    name: string;
    description?: string;
    color: string;
    category: "BACKLOG" | "UNSTARTED" | "STARTED" | "COMPLETED" | "CANCELED";
  }>;
  modules: Array<{
    name: string;
    purpose: string;
    features: Array<{
      name: string;
      description: string;
      purpose?: string;
      actors?: string[];
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
    }>;
  }>;
  epics: Array<{
    name: string;
    description?: string;
  }>;
  tasks: Array<{
    title: string;
    description?: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    estimatedHours: number;
    epicIndex?: number;
    suggestedStateIndex?: number;
    subtasks?: Array<{ title: string; description?: string }>;
    acceptanceCriteria?: string[];
    suggestedRole?: string;
    sourceFeatureName?: string;
  }>;
  dependencies: Array<{
    taskIndex: number;
    dependsOnTaskIndex: number;
    type: "BLOCKS" | "BLOCKED_BY";
    description?: string;
  }>;
  risks: Array<{
    title: string;
    type:
      | "TECHNICAL"
      | "INTEGRATION"
      | "REQUIREMENTS"
      | "TIMELINE"
      | "SCALABILITY";
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    mitigation: string;
  }>;
  timeline: {
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
  };
}

export interface AIPlanModificationResponse {
  updatedPlan: AIProjectPlanResponse;
  delta: {
    addedFeatures: string[];
    removedFeatures: string[];
    modifiedFeatures: string[];
    timelineDeltaHours: number;
    summary: string;
  };
}

export interface AITaskDecompositionResponse {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedHours: number;
  subtasks: Array<{
    title: string;
    description?: string;
    estimatedHours?: number;
  }>;
  dependencies: string[];
  rationale?: string;
}

export interface AIDailyScheduleResponse {
  summary: string;
  timeBlocks: Array<{
    time: string;
    taskTitle: string;
    taskId?: string;
    notes?: string;
  }>;
}

class AIService {
  private getApiKey(userApiKey?: string): string {
    if (!userApiKey || !userApiKey.trim()) {
      throw new Error(
        "AI API key is missing from your database configuration. Please save your API key in Profile/Settings.",
      );
    }
    return userApiKey.trim();
  }

  private getModel(userModel?: string): string {
    return userModel || "gemini-3.6-flash";
  }

  public async generate(
    messages: AIServiceMessage[],
    options: AIServiceOptions = {},
    userApiKey?: string,
  ): Promise<string> {
    const apiKey = this.getApiKey(userApiKey);
    const provider = options.provider || "gemini";
    const rawModel = options.modelName || "gemini-3.6-flash";
    const model = this.getModel(rawModel);

    let url = options.baseUrl ? options.baseUrl.trim() : "";
    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    let body: Record<string, unknown> = {};

    if (provider === "openai") {
      if (!url) url = "https://api.openai.com/v1";
      url = `${url.replace(/\/$/, "")}/chat/completions`;
      headers["Authorization"] = `Bearer ${apiKey}`;
      body = {
        model: rawModel,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
      };
      if (options.responseFormatJson) {
        body.response_format = { type: "json_object" };
      }
    } else if (provider === "anthropic") {
      if (!url) url = "https://api.anthropic.com/v1";
      url = `${url.replace(/\/$/, "")}/messages`;
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";

      const systemMsg = messages.find((m) => m.role === "system")?.content;
      const userMsgs = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role:
            m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

      body = {
        model: rawModel,
        messages: userMsgs,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.2,
      };
      if (systemMsg) {
        body.system = systemMsg;
      }
    } else {
      // Default: Google Gemini API
      if (!url) url = "https://generativelanguage.googleapis.com/v1beta/openai";
      url = `${url.replace(/\/$/, "")}/chat/completions?key=${encodeURIComponent(apiKey)}`;
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["x-goog-api-key"] = apiKey;
      body = {
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 4096,
      };
      if (options.responseFormatJson) {
        body.response_format = { type: "json_object" };
      }
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        logger.error(
          `AI API Error (${provider} ${response.status}): ${errText}`,
        );
        throw new Error(
          `AI generation failed with status ${response.status}: ${errText || response.statusText}`,
        );
      }

      const json = await response.json();
      let content = "";
      if (provider === "anthropic") {
        content = (json as any).content?.[0]?.text || "";
      } else {
        content = (json as any).choices?.[0]?.message?.content || "";
      }

      if (typeof content !== "string" || !content.trim()) {
        throw new Error(
          `Invalid or empty response content from ${provider} AI`,
        );
      }
      return content.trim();
    } catch (err: any) {
      logger.error("AIService.generate error:", err);
      throw err;
    }
  }

  public async generateStructured<T>(
    prompt: string,
    systemPrompt: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
  ): Promise<T> {
    const messages: AIServiceMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const rawResponse = await this.generate(
      messages,
      { temperature: 0.2, responseFormatJson: true, ...options },
      userApiKey,
    );

    let cleaned = rawResponse.trim();
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      try {
        // eslint-disable-next-line no-control-regex
        const sanitized = cleaned.replace(/[\u0000-\u001F]/g, (char) => {
          if (char === "\n") return "\\n";
          if (char === "\r") return "\\r";
          if (char === "\t") return "\\t";
          return "";
        });
        return JSON.parse(sanitized) as T;
      } catch (parseError) {
        logger.error(
          `Failed to parse AI structured response JSON: ${rawResponse}`,
          parseError instanceof Error
            ? parseError
            : new Error(String(parseError)),
        );
        throw new Error("AI returned malformed structured output JSON");
      }
    }
  }

  private normalizeProjectPlan(raw: any): AIProjectPlanResponse {
    if (!raw || typeof raw !== "object") {
      return {
        name: "Generated System Blueprint",
        description: "AI Project Implementation Plan",
        systemGoal: "Fulfill requested system requirements",
        coreWorkflow: [],
        actors: [],
        suggestedStates: [],
        modules: [],
        epics: [],
        tasks: [],
        dependencies: [],
        risks: [],
        timeline: {
          totalEngineeringHours: 0,
          totalEngineeringDays: 0,
          estimatedCalendarWeeks: 0,
          confidence: "MEDIUM",
          assumptions: [],
          milestones: [],
        },
      };
    }

    let plan = raw;
    if (
      !plan.name &&
      !plan.systemGoal &&
      !plan.system_goal &&
      !plan.modules &&
      !plan.system
    ) {
      const keys = Object.keys(plan);
      for (const key of keys) {
        if (
          plan[key] &&
          typeof plan[key] === "object" &&
          (plan[key].name ||
            plan[key].systemGoal ||
            plan[key].system_goal ||
            plan[key].modules ||
            plan[key].system)
        ) {
          plan = plan[key];
          break;
        }
      }
    }

    return {
      name:
        plan.name || plan.system || plan.title || "Generated System Blueprint",
      description:
        plan.description || plan.overview || "AI Project Implementation Plan",
      systemGoal:
        plan.systemGoal ||
        plan.system_goal ||
        plan.goal ||
        plan.purpose ||
        "Fulfill requested system requirements",
      coreWorkflow: Array.isArray(
        plan.coreWorkflow ||
          plan.core_workflow ||
          plan.customerFlow ||
          plan.workflow,
      )
        ? (
            plan.coreWorkflow ||
            plan.core_workflow ||
            plan.customerFlow ||
            plan.workflow
          ).map((w: any) =>
            typeof w === "string"
              ? w
              : w.action || w.name || w.step || JSON.stringify(w),
          )
        : [],
      actors: Array.isArray(plan.actors) ? plan.actors : [],
      suggestedStates: Array.isArray(
        plan.suggestedStates || plan.suggested_states,
      )
        ? plan.suggestedStates || plan.suggested_states
        : [],
      modules: Array.isArray(plan.modules) ? plan.modules : [],
      epics: Array.isArray(plan.epics) ? plan.epics : [],
      tasks: Array.isArray(plan.tasks) ? plan.tasks : [],
      dependencies: Array.isArray(plan.dependencies) ? plan.dependencies : [],
      risks: Array.isArray(plan.risks) ? plan.risks : [],
      timeline: plan.timeline || {
        totalEngineeringHours: 80,
        totalEngineeringDays: 10,
        estimatedCalendarWeeks: 2,
        confidence: "HIGH",
        assumptions: [],
        milestones: [],
      },
    };
  }

  public async planProject(
    prompt: string,
    context?: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<AIProjectPlanResponse> {
    const { content: systemPrompt } = await promptResolverService.resolve(
      "project-planner",
      scope,
    );

    const fullPrompt = context
      ? `User System Requirements:\n${prompt}\n\nExisting Context:\n${context}`
      : `User System Requirements:\n${prompt}`;

    const rawPlan = await this.generateStructured<any>(
      fullPrompt,
      systemPrompt,
      userApiKey,
      options,
    );

    return this.normalizeProjectPlan(rawPlan);
  }

  public async modifyProjectPlan(
    existingPlan: AIProjectPlanResponse,
    changeRequest: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<AIPlanModificationResponse> {
    const { content: systemPrompt } = await promptResolverService.resolve(
      "plan-modifier",
      scope,
    );

    const prompt = `Existing Project Plan:\n${JSON.stringify(existingPlan, null, 2)}\n\nUser Change Request:\n${changeRequest}`;
    return this.generateStructured<AIPlanModificationResponse>(
      prompt,
      systemPrompt,
      userApiKey,
      options,
    );
  }

  public async decomposeTask(
    taskTitle: string,
    taskDescription?: string,
    projectContext?: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<AITaskDecompositionResponse> {
    const { content: systemPrompt } = await promptResolverService.resolve(
      "task-breakdown",
      scope,
    );

    const prompt = `Task: ${taskTitle}\nDescription: ${taskDescription || "N/A"}\nProject Context: ${projectContext || "N/A"}`;
    return this.generateStructured<AITaskDecompositionResponse>(
      prompt,
      systemPrompt,
      userApiKey,
      options,
    );
  }

  public async planDailyWork(
    taskSummaryList: Array<{
      id: string;
      title: string;
      priority: string;
      dueDate?: string;
      isBlocked?: boolean;
    }>,
    userWorkloadContext?: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<AIDailyScheduleResponse> {
    const { content: systemPrompt } = await promptResolverService.resolve(
      "daily-planner",
      scope,
    );

    const prompt = `Current User Tasks:\n${JSON.stringify(taskSummaryList, null, 2)}\n\nWorkload Context:\n${userWorkloadContext || "Standard 8-hour work day"}`;
    return this.generateStructured<AIDailyScheduleResponse>(
      prompt,
      systemPrompt,
      userApiKey,
      options,
    );
  }

  public async generateDocument(
    docType: string,
    title: string,
    projectContext: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<{ title: string; content: string; tags: string[] }> {
    const { content: systemPrompt } = await promptResolverService.resolve(
      "document-generator",
      scope,
      { doc_type: docType },
    );

    const prompt = `Document Type: ${docType}\nDocument Title: ${title}\nProject Context:\n${projectContext}`;
    return this.generateStructured<{
      title: string;
      content: string;
      tags: string[];
    }>(prompt, systemPrompt, userApiKey, options);
  }

  public async generateMeetingNotes(
    rawNotesOrTranscript: string,
    projectContext?: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<{
    title: string;
    summary: string;
    keyDecisions: string[];
    actionItems: Array<{ taskTitle: string; assigneeName?: string }>;
    openQuestions: string[];
    contentMarkdown: string;
  }> {
    const { content: systemPrompt } = await promptResolverService.resolve(
      "meeting-notes",
      scope,
    );

    const prompt = `Raw Notes / Transcript:\n${rawNotesOrTranscript}\n\nProject Context:\n${projectContext || "N/A"}`;
    return this.generateStructured(prompt, systemPrompt, userApiKey, options);
  }

  public async chatAssistant(
    userMessage: string,
    projectKnowledgeBase: string,
    chatHistory: AIServiceMessage[] = [],
    userApiKey?: string,
    options: AIServiceOptions = {},
    scope?: PromptScope,
  ): Promise<string> {
    const { content: systemContent } = await promptResolverService.resolve(
      "project-chat",
      scope,
      { project_knowledge: projectKnowledgeBase },
    );
    const systemInstruction: AIServiceMessage = {
      role: "system",
      content: systemContent,
    };

    const messages: AIServiceMessage[] = [
      systemInstruction,
      ...chatHistory.slice(-10),
      { role: "user", content: userMessage },
    ];

    return this.generate(
      messages,
      { temperature: 0.3, ...options },
      userApiKey,
    );
  }
}

export default new AIService();
