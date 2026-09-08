import env from "../../config/env.js";
import logger from "../../lib/logger.js";

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
    type: "TECHNICAL" | "INTEGRATION" | "REQUIREMENTS" | "TIMELINE" | "SCALABILITY";
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
    return "gemini-3.6-flash";
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
    let headers: Record<string, string> = { "Content-Type": "application/json" };
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
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
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
        logger.error(`AI API Error (${provider} ${response.status}): ${errText}`);
        throw new Error(`AI generation failed with status ${response.status}: ${errText || response.statusText}`);
      }

      const json = await response.json();
      let content = "";
      if (provider === "anthropic") {
        content = (json as any).content?.[0]?.text || "";
      } else {
        content = (json as any).choices?.[0]?.message?.content || "";
      }

      if (typeof content !== "string" || !content.trim()) {
        throw new Error(`Invalid or empty response content from ${provider} AI`);
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
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      try {
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
          parseError instanceof Error ? parseError : new Error(String(parseError)),
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
        timeline: { totalEngineeringHours: 0, totalEngineeringDays: 0, estimatedCalendarWeeks: 0, confidence: "MEDIUM", assumptions: [], milestones: [] }
      };
    }

    let plan = raw;
    if (!plan.name && !plan.systemGoal && !plan.system_goal && !plan.modules && !plan.system) {
      const keys = Object.keys(plan);
      for (const key of keys) {
        if (plan[key] && typeof plan[key] === "object" && (plan[key].name || plan[key].systemGoal || plan[key].system_goal || plan[key].modules || plan[key].system)) {
          plan = plan[key];
          break;
        }
      }
    }

    return {
      name: plan.name || plan.system || plan.title || "Generated System Blueprint",
      description: plan.description || plan.overview || "AI Project Implementation Plan",
      systemGoal: plan.systemGoal || plan.system_goal || plan.goal || plan.purpose || "Fulfill requested system requirements",
      coreWorkflow: Array.isArray(plan.coreWorkflow || plan.core_workflow || plan.customerFlow || plan.workflow)
        ? (plan.coreWorkflow || plan.core_workflow || plan.customerFlow || plan.workflow).map((w: any) => typeof w === "string" ? w : (w.action || w.name || w.step || JSON.stringify(w)))
        : [],
      actors: Array.isArray(plan.actors) ? plan.actors : [],
      suggestedStates: Array.isArray(plan.suggestedStates || plan.suggested_states) ? (plan.suggestedStates || plan.suggested_states) : [],
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
        milestones: []
      }
    };
  }

  public async planProject(
    prompt: string,
    context?: string,
    userApiKey?: string,
    options: AIServiceOptions = {},
  ): Promise<AIProjectPlanResponse> {
    const systemPrompt = `You are a Senior AI Project Architect and Planner.
Act as an AI Project Architect to transform user high-level requirements into a structured, production-grade Project Implementation Blueprint.
DO NOT provide source code. Provide detailed engineering specifications, actor definitions, modular breakdowns, implementation requirements, timeline estimates, risks, and tasks.

Return JSON with exact structure:
{
  "name": "Project Title",
  "description": "Short overview",
  "systemGoal": "Primary business/system goal",
  "coreWorkflow": ["Step 1...", "Step 2...", "Step 3..."],
  "actors": [
    {
      "name": "Customer / Admin / Payment Gateway",
      "type": "HUMAN" | "SYSTEM" | "EXTERNAL_SERVICE",
      "responsibilities": ["Browse products", "Place order"],
      "permissions": ["READ", "WRITE"]
    }
  ],
  "suggestedStates": [
    {"name": "Backlog", "category": "BACKLOG", "color": "#9CA3AF"},
    {"name": "In Progress", "category": "STARTED", "color": "#3B82F6"},
    {"name": "Code Review", "category": "STARTED", "color": "#8B5CF6"},
    {"name": "Done", "category": "COMPLETED", "color": "#10B981"}
  ],
  "modules": [
    {
      "name": "Module Name (e.g. Authentication, Orders)",
      "purpose": "Why this module exists",
      "features": [
        {
          "name": "Feature Name",
          "description": "Short summary",
          "purpose": "Why this feature exists",
          "actors": ["Customer"],
          "userFlow": ["User opens form", "Submits info"],
          "backendRequirements": ["Input validation", "Database insert"],
          "frontendRequirements": ["Form component", "Loading state"],
          "databaseRequirements": ["User table schema"],
          "apiRequirements": ["POST /api/register"],
          "validation": ["Email uniqueness"],
          "authorization": ["Public"],
          "errorHandling": ["400 Bad Request"],
          "acceptanceCriteria": ["Valid inputs create user"],
          "estimatedHours": 8
        }
      ]
    }
  ],
  "epics": [
    {"name": "Phase 1: Foundation & Auth", "description": "Core setup"}
  ],
  "tasks": [
    {
      "title": "Task title",
      "description": "Implementation specification",
      "priority": "HIGH",
      "estimatedHours": 8,
      "epicIndex": 0,
      "suggestedStateIndex": 0,
      "subtasks": [{"title": "Subtask title"}],
      "acceptanceCriteria": ["Criteria 1"],
      "suggestedRole": "Backend Developer",
      "sourceFeatureName": "Feature Name"
    }
  ],
  "dependencies": [
    {
      "taskIndex": 1,
      "dependsOnTaskIndex": 0,
      "type": "BLOCKS",
      "description": "Task 1 requires task 0 baseline"
    }
  ],
  "risks": [
    {
      "title": "Risk title",
      "type": "TECHNICAL" | "INTEGRATION" | "REQUIREMENTS" | "TIMELINE" | "SCALABILITY",
      "severity": "HIGH",
      "mitigation": "Mitigation strategy"
    }
  ],
  "timeline": {
    "totalEngineeringHours": 120,
    "totalEngineeringDays": 15,
    "estimatedCalendarWeeks": 3,
    "confidence": "HIGH",
    "assumptions": ["Existing setup available"],
    "milestones": [
      {
        "name": "Milestone 1: Authentication & Setup",
        "description": "Core foundation",
        "estimatedHours": 40,
        "epicNames": ["Phase 1: Foundation & Auth"]
      }
    ]
  }
}`;

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
  ): Promise<AIPlanModificationResponse> {
    const systemPrompt = `You are a Senior AI Project Architect.
The user wants to request changes to an existing project implementation plan.
Analyze the user change request (e.g., "Remove delivery module", "Add affiliate system"), apply the modifications to the project plan, and calculate the exact Delta.

Return JSON with structure:
{
  "updatedPlan": <FULL_UPDATED_PROJECT_PLAN_JSON>,
  "delta": {
    "addedFeatures": ["Affiliate Signup", "Commission Tracking"],
    "removedFeatures": ["Delivery Tracking"],
    "modifiedFeatures": ["Order Status"],
    "timelineDeltaHours": -16,
    "summary": "Removed Delivery module (-32 hrs), added Affiliate module (+16 hrs)."
  }
}`;

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
  ): Promise<AITaskDecompositionResponse> {
    const systemPrompt = `You are an Agile Task Planner AI. Decompose the given task into detailed subtasks, realistic estimated hours, and priority.
Return JSON:
{
  "title": "Cleaned Task Title",
  "description": "Enhanced description with acceptance criteria",
  "priority": "MEDIUM",
  "estimatedHours": 6,
  "subtasks": [
    {"title": "Step 1...", "description": "...", "estimatedHours": 2}
  ],
  "dependencies": [],
  "rationale": "Why this breakdown makes sense"
}`;

    const prompt = `Task: ${taskTitle}\nDescription: ${taskDescription || "N/A"}\nProject Context: ${projectContext || "N/A"}`;
    return this.generateStructured<AITaskDecompositionResponse>(
      prompt,
      systemPrompt,
      userApiKey,
    );
  }

  public async planDailyWork(
    taskSummaryList: Array<{ id: string; title: string; priority: string; dueDate?: string; isBlocked?: boolean }>,
    userWorkloadContext?: string,
    userApiKey?: string,
  ): Promise<AIDailyScheduleResponse> {
    const systemPrompt = `You are an AI Productivity Assistant. Create a prioritized daily schedule for the user based on their current task list, considering priority, deadlines, and blocked tasks.
Return JSON:
{
  "summary": "Overview of today's focus",
  "timeBlocks": [
    {"time": "09:00 - 10:30", "taskTitle": "...", "taskId": "...", "notes": "Focus on high-priority blocker"}
  ]
}`;

    const prompt = `Current User Tasks:\n${JSON.stringify(taskSummaryList, null, 2)}\n\nWorkload Context:\n${userWorkloadContext || "Standard 8-hour work day"}`;
    return this.generateStructured<AIDailyScheduleResponse>(
      prompt,
      systemPrompt,
      userApiKey,
    );
  }

  public async generateDocument(
    docType: string,
    title: string,
    projectContext: string,
    userApiKey?: string,
  ): Promise<{ title: string; content: string; tags: string[] }> {
    const systemPrompt = `You are a Technical Writer & Product Architect AI. Generate a comprehensive, professional Markdown document (${docType}) based on the project context.
Return JSON:
{
  "title": "Document Title",
  "content": "Full markdown content with headings, bullet points, acceptance criteria, tables, and sections.",
  "tags": ["prd", "architecture", "v1"]
}`;

    const prompt = `Document Type: ${docType}\nDocument Title: ${title}\nProject Context:\n${projectContext}`;
    return this.generateStructured<{ title: string; content: string; tags: string[] }>(
      prompt,
      systemPrompt,
      userApiKey,
    );
  }

  public async generateMeetingNotes(
    rawNotesOrTranscript: string,
    projectContext?: string,
    userApiKey?: string,
  ): Promise<{
    title: string;
    summary: string;
    keyDecisions: string[];
    actionItems: Array<{ taskTitle: string; assigneeName?: string }>;
    openQuestions: string[];
    contentMarkdown: string;
  }> {
    const systemPrompt = `You are an Executive AI Assistant. Process meeting notes or transcripts into structured summaries, key decisions, and action items.
Return JSON:
{
  "title": "Meeting Notes - [Topic]",
  "summary": "High level overview",
  "keyDecisions": ["Decision 1..."],
  "actionItems": [{"taskTitle": "Action item...", "assigneeName": "Name"}],
  "openQuestions": ["Question 1..."],
  "contentMarkdown": "Formatted markdown notes"
}:`;

    const prompt = `Raw Notes / Transcript:\n${rawNotesOrTranscript}\n\nProject Context:\n${projectContext || "N/A"}`;
    return this.generateStructured(prompt, systemPrompt, userApiKey);
  }

  public async chatAssistant(
    userMessage: string,
    projectKnowledgeBase: string,
    chatHistory: AIServiceMessage[] = [],
    userApiKey?: string,
  ): Promise<string> {
    const systemInstruction: AIServiceMessage = {
      role: "system",
      content: `You are the Project AI Assistant inside the project chat. You have access to real-time project context, original requirements, canonical plan, modules, tasks, milestones, documents, and chat history.
Ground your answers in the provided Project Knowledge Base.
Clearly distinguish between:
1. Known project facts and canonical plan requirements
2. Current task execution status & timeline progress
3. Recommendations for the team.

Project Knowledge Base:
${projectKnowledgeBase}`,
    };

    const messages: AIServiceMessage[] = [
      systemInstruction,
      ...chatHistory.slice(-10),
      { role: "user", content: userMessage },
    ];

    return this.generate(messages, { temperature: 0.3 }, userApiKey);
  }
}

export default new AIService();
