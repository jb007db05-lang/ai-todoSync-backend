export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

type JsonSchema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
};

function validateValue(
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (value === undefined || value === null) {
    return; // required check is done at parent level
  }

  const types = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];

  if (types.length > 0) {
    const actualType =
      value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const typeMatch = types.some((t) => t === actualType);
    if (!typeMatch) {
      errors.push(
        `${path}: expected type "${types.join(" | ")}" but got "${actualType}"`,
      );
      return;
    }
  }

  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value)) {
      errors.push(
        `${path}: value "${String(value)}" must be one of [${schema.enum.map(String).join(", ")}]`,
      );
    }
    return;
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: must be <= ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: length must be >= ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: length must be <= ${schema.maxLength}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: array length must be >= ${schema.minItems}`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${path}: array length must be <= ${schema.maxItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) => {
        validateValue(schema.items!, item, `${path}[${i}]`, errors);
      });
    }
  }

  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    const obj = value as Record<string, unknown>;

    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj) || obj[key] === undefined || obj[key] === null) {
          errors.push(`${path}.${key}: required field is missing`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          validateValue(subSchema, obj[key], `${path}.${key}`, errors);
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      // Allow internal MCP token
      allowedKeys.add("_confirmationToken");
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.has(key)) {
          errors.push(`${path}.${key}: additional property not allowed`);
        }
      }
    }
  }
}

export function validateInput(
  schema: JsonSchema,
  data: unknown,
): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  validateValue(schema, data, "input", errors);

  return { valid: errors.length === 0, errors };
}
