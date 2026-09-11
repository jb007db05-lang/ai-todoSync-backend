import type { McpManifestEntry, McpScope, ToolEntry } from "./tool-types.js";

class ToolRegistry {
  private readonly entries = new Map<string, ToolEntry>();

  public register(entry: ToolEntry): void {
    if (this.entries.has(entry.name)) {
      throw new Error(
        `MCP tool "${entry.name}" is already registered. Use unique tool names.`,
      );
    }
    this.entries.set(entry.name, entry);
  }

  public getEntry(name: string): ToolEntry | null {
    return this.entries.get(name) ?? null;
  }

  public listEntries(scopeFilter?: McpScope[]): ToolEntry[] {
    const all = Array.from(this.entries.values());
    if (!scopeFilter || scopeFilter.length === 0) {
      return all;
    }
    return all.filter((entry) => scopeFilter.includes(entry.requiredScope));
  }

  public listManifest(scopeFilter?: McpScope[]): McpManifestEntry[] {
    return this.listEntries(scopeFilter).map((entry) => ({
      name: entry.name,
      description: entry.description,
      domain: entry.domain,
      inputSchema: entry.inputSchema,
      risk: entry.risk,
      requiresConfirmation: entry.requiresConfirmation ?? false,
    }));
  }

  public size(): number {
    return this.entries.size;
  }
}

// Singleton registry shared across all domain tool files
const toolRegistry = new ToolRegistry();
export default toolRegistry;
