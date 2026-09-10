import type {
  IPromptMessage,
  IPromptVariable,
} from "../../../interfaces/prompt/prompt.interface.js";

import { HttpError } from "../../../shared/errors/http-error.js";

export class PromptVariableService {
  /**
   * Validate variable schema definitions (F-05)
   */
  public validateVariableSchema = (variables: IPromptVariable[] = []): void => {
    const seenNames = new Set<string>();

    for (const v of variables) {
      if (!v.name || !v.name.trim()) {
        throw new HttpError(400, "Variable name cannot be empty.");
      }

      const cleanName = v.name.trim();

      if (!/^[a-zA-Z0-9_]+$/.test(cleanName)) {
        throw new HttpError(
          400,
          `Variable name '${cleanName}' contains invalid characters. Only alphanumeric characters and underscores are allowed.`,
        );
      }

      if (seenNames.has(cleanName)) {
        throw new HttpError(
          400,
          `Duplicate variable name '${cleanName}' in variable schema.`,
        );
      }
      seenNames.add(cleanName);

      const varType = v.type || "string";
      if (!["string", "number", "json", "boolean", "enum"].includes(varType)) {
        throw new HttpError(
          400,
          `Unsupported variable type '${varType}' for variable '${cleanName}'.`,
        );
      }

      if (varType === "enum") {
        if (!v.options || !Array.isArray(v.options) || v.options.length === 0) {
          throw new HttpError(
            400,
            `Enum variable '${cleanName}' must have at least one valid option.`,
          );
        }
        const seenOpts = new Set<string>();
        for (const rawOpt of v.options) {
          const opt = (rawOpt || "").trim();
          if (!opt) {
            throw new HttpError(
              400,
              `Enum variable '${cleanName}' options cannot contain empty strings.`,
            );
          }
          if (seenOpts.has(opt)) {
            throw new HttpError(
              400,
              `Duplicate enum option '${opt}' in variable '${cleanName}'.`,
            );
          }
          seenOpts.add(opt);
        }
      }

      if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
        throw new HttpError(
          400,
          `Variable '${cleanName}' min constraint (${v.min}) cannot be greater than max constraint (${v.max}).`,
        );
      }

      if (v.regex) {
        try {
          new RegExp(v.regex);
        } catch (_err) {
          throw new HttpError(
            400,
            `Invalid regex pattern '${v.regex}' for variable '${cleanName}'.`,
          );
        }
      }

      if (
        v.defaultValue !== undefined &&
        v.defaultValue !== null &&
        String(v.defaultValue).trim() !== ""
      ) {
        const defStr = String(v.defaultValue).trim();
        if (varType === "number") {
          const num = Number(defStr);
          if (isNaN(num)) {
            throw new HttpError(
              400,
              `Default value for variable '${cleanName}' must be a valid number.`,
            );
          }
          if (v.min !== undefined && num < v.min) {
            throw new HttpError(
              400,
              `Default value for variable '${cleanName}' must be at least ${v.min}.`,
            );
          }
          if (v.max !== undefined && num > v.max) {
            throw new HttpError(
              400,
              `Default value for variable '${cleanName}' must be at most ${v.max}.`,
            );
          }
        } else if (varType === "boolean") {
          if (!["true", "false", "1", "0"].includes(defStr.toLowerCase())) {
            throw new HttpError(
              400,
              `Default value for variable '${cleanName}' must be a boolean.`,
            );
          }
        } else if (varType === "enum") {
          const validOpts = (v.options || []).map((o) => o.trim());
          if (!validOpts.includes(defStr)) {
            throw new HttpError(
              400,
              `Default value for enum variable '${cleanName}' must be one of: ${validOpts.join(", ")}.`,
            );
          }
        } else if (varType === "json") {
          try {
            JSON.parse(defStr);
          } catch (_err) {
            throw new HttpError(
              400,
              `Default value for variable '${cleanName}' must be valid JSON.`,
            );
          }
        } else if (varType === "string") {
          if (v.min !== undefined && defStr.length < v.min) {
            throw new HttpError(
              400,
              `Default value length for variable '${cleanName}' must be at least ${v.min} characters.`,
            );
          }
          if (v.max !== undefined && defStr.length > v.max) {
            throw new HttpError(
              400,
              `Default value length for variable '${cleanName}' must be at most ${v.max} characters.`,
            );
          }
          if (v.regex) {
            const re = new RegExp(v.regex);
            if (!re.test(defStr)) {
              throw new HttpError(
                400,
                `Default value for variable '${cleanName}' does not match pattern '${v.regex}'.`,
              );
            }
          }
        }
      }
    }
  };

  /**
   * Automatically detect Handlebars variables like {{variable_name}} from text content
   */
  public extractHandlebarsVariables(text: string): string[] {
    if (!text) return [];
    const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
    const matches = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        matches.add(match[1].trim());
      }
    }
    return Array.from(matches);
  }

  /**
   * Merge auto-detected variables with existing variable schemas
   */
  public syncVariables(
    bodyText: string,
    messages: IPromptMessage[] = [],
    providedVariables: IPromptVariable[] = [],
  ): IPromptVariable[] {
    const combinedContent = [bodyText, ...messages.map((m) => m.content)].join(
      "\n",
    );
    const detectedNames = this.extractHandlebarsVariables(combinedContent);

    const variableMap = new Map<string, IPromptVariable>();

    for (const v of providedVariables) {
      if (v.name && v.name.trim()) {
        const cleanName = v.name.trim();
        variableMap.set(cleanName, {
          name: cleanName,
          type: v.type || "string",
          description: v.description || "",
          defaultValue: v.defaultValue || "",
          required: v.required ?? true,
          options: v.options
            ? v.options.map((o) => o.trim()).filter(Boolean)
            : [],
          min: v.min,
          max: v.max,
          regex: v.regex,
        });
      }
    }

    for (const name of detectedNames) {
      if (!variableMap.has(name)) {
        variableMap.set(name, {
          name,
          type: "string",
          description: `Auto-detected variable: ${name}`,
          defaultValue: "",
          required: true,
        });
      }
    }

    const synced = Array.from(variableMap.values());
    this.validateVariableSchema(synced);
    return synced;
  }

  /**
   * Validate supplied variable values against schema (F-05)
   */
  public validateVariableValues(
    variables: IPromptVariable[] = [],
    suppliedValues: Record<string, any> = {},
  ): Record<string, any> {
    const validated: Record<string, any> = {};

    for (const v of variables) {
      const rawVal = suppliedValues[v.name];
      let val = rawVal !== undefined ? rawVal : v.defaultValue;

      if (val === undefined || val === null || val === "") {
        if (v.required) {
          throw new HttpError(400, `Variable '${v.name}' is required.`);
        }
        if (
          v.defaultValue !== undefined &&
          v.defaultValue !== null &&
          String(v.defaultValue).trim() !== ""
        ) {
          val = v.defaultValue;
        } else {
          continue;
        }
      }

      const varType = v.type || "string";

      if (varType === "number") {
        const num = Number(val);
        if (isNaN(num)) {
          throw new HttpError(
            400,
            `Variable '${v.name}' must be a valid number.`,
          );
        }
        if (v.min !== undefined && num < v.min) {
          throw new HttpError(
            400,
            `Variable '${v.name}' must be at least ${v.min}.`,
          );
        }
        if (v.max !== undefined && num > v.max) {
          throw new HttpError(
            400,
            `Variable '${v.name}' must be at most ${v.max}.`,
          );
        }
        validated[v.name] = num;
      } else if (varType === "boolean") {
        if (typeof val === "boolean") {
          validated[v.name] = val;
        } else if (val === "true" || val === "1") {
          validated[v.name] = true;
        } else if (val === "false" || val === "0") {
          validated[v.name] = false;
        } else {
          throw new HttpError(400, `Variable '${v.name}' must be a boolean.`);
        }
      } else if (varType === "enum") {
        const strVal = String(val).trim();
        if (v.options && v.options.length > 0 && !v.options.includes(strVal)) {
          throw new HttpError(
            400,
            `Variable '${v.name}' must be one of: ${v.options.join(", ")}`,
          );
        }
        validated[v.name] = strVal;
      } else if (varType === "json") {
        if (typeof val === "object" && val !== null) {
          validated[v.name] = val;
        } else {
          try {
            validated[v.name] = JSON.parse(String(val));
          } catch (_e) {
            throw new HttpError(
              400,
              `Variable '${v.name}' must be valid JSON.`,
            );
          }
        }
      } else {
        const strVal = String(val);
        if (v.min !== undefined && strVal.length < v.min) {
          throw new HttpError(
            400,
            `Variable '${v.name}' length must be at least ${v.min} characters.`,
          );
        }
        if (v.max !== undefined && strVal.length > v.max) {
          throw new HttpError(
            400,
            `Variable '${v.name}' length must be at most ${v.max} characters.`,
          );
        }
        if (v.regex) {
          try {
            const re = new RegExp(v.regex);
            if (!re.test(strVal)) {
              throw new HttpError(
                400,
                `Variable '${v.name}' does not match required pattern ${v.regex}.`,
              );
            }
          } catch (e) {
            if (e instanceof HttpError) throw e;
            throw new HttpError(
              400,
              `Invalid regex validation constraint on '${v.name}'.`,
            );
          }
        }
        validated[v.name] = strVal;
      }
    }

    return validated;
  }

  /**
   * Deterministic variable substitution engine for gateway execution (F-05)
   */
  public substituteVariables(
    contentOrMessages: string | IPromptMessage[],
    variables: IPromptVariable[] = [],
    suppliedValues: Record<string, any> = {},
  ): string | IPromptMessage[] {
    const validatedVals = this.validateVariableValues(
      variables,
      suppliedValues,
    );

    const replaceText = (text: string): string => {
      if (!text) return "";
      return text.replace(
        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        (match, varName) => {
          const key = varName.trim();
          const val = validatedVals[key];
          if (val === undefined || val === null) return match;
          return typeof val === "object" ? JSON.stringify(val) : String(val);
        },
      );
    };

    if (typeof contentOrMessages === "string") {
      return replaceText(contentOrMessages);
    }

    return contentOrMessages.map((msg) => ({
      role: msg.role,
      content: replaceText(msg.content),
    }));
  }
}

export default new PromptVariableService();
