// MCP type definitions — risk levels, scopes, and tool entry contract.

export type RiskLevel =
  | "read"
  | "write"
  | "sensitive_write"
  | "destructive"
  | "security_critical";

export type McpScope =
  | "work:read"
  | "work:write"
  | "collaboration:read"
  | "collaboration:write"
  | "analytics:read"
  | "ai:execute"
  | "prompt:read"
  | "prompt:write"
  | "workspace:admin";

export const DEFAULT_MCP_SCOPES: McpScope[] = [
  "work:read",
  "analytics:read",
  "prompt:read",
  "collaboration:read",
];

export interface ToolEntry {
  name: string;
  description: string;
  domain: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpScope;
  risk: RiskLevel;
  requiresConfirmation?: boolean;
  handler: (userId: string, input: Record<string, unknown>) => Promise<unknown>;
}

export interface McpManifestEntry {
  name: string;
  description: string;
  domain: string;
  inputSchema: Record<string, unknown>;
  risk: RiskLevel;
  requiresConfirmation: boolean;
}

export interface McpToolCallResult {
  tool: string;
  data: unknown;
  risk: RiskLevel;
  domain: string;
}
