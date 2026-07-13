import { AppError } from "../../utils/app-error.js";
import type { SdkEnvironment } from "./model.js";

const VALID_ENVIRONMENTS: SdkEnvironment[] = [
  "development",
  "staging",
  "production",
];

export interface CreateIntegrationDto {
  name: string;
  environment: SdkEnvironment;
  domain: string;
  allowedOrigins?: string[];
  description?: string;
}

export interface UpdateIntegrationDto {
  name?: string;
  environment?: string;
  domain?: string;
  allowedOrigins?: string[];
  description?: string;
}

export const validateCreate = (body: unknown): CreateIntegrationDto => {
  if (!body || typeof body !== "object") {
    throw new AppError(400, "Request body is required", "VALIDATION_ERROR");
  }

  const { name, environment, domain, applicationUrl, allowedOrigins, description } = body as Record<
    string,
    unknown
  >;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new AppError(400, "name is required", "VALIDATION_ERROR");
  }

  if (
    !environment ||
    typeof environment !== "string" ||
    !VALID_ENVIRONMENTS.includes(environment as SdkEnvironment)
  ) {
    throw new AppError(
      400,
      `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}`,
      "VALIDATION_ERROR",
    );
  }

  const targetDomain = (applicationUrl || domain) as string | undefined;

  if (!targetDomain || typeof targetDomain !== "string" || targetDomain.trim().length === 0) {
    throw new AppError(400, "applicationUrl is required", "VALIDATION_ERROR");
  }

  let parsedOrigins: string[] | undefined;
  if (allowedOrigins !== undefined) {
    if (!Array.isArray(allowedOrigins)) {
      throw new AppError(400, "allowedOrigins must be an array of strings", "VALIDATION_ERROR");
    }
    parsedOrigins = allowedOrigins.map((o) => {
      if (typeof o !== "string" || o.trim().length === 0) {
        throw new AppError(400, "allowedOrigins must contain non-empty strings", "VALIDATION_ERROR");
      }
      return o.trim();
    });
  }

  return {
    name: name.trim(),
    environment: environment as SdkEnvironment,
    domain: targetDomain.trim(),
    allowedOrigins: parsedOrigins,
    description:
      typeof description === "string" ? description.trim() : undefined,
  };
};

export const validateUpdate = (body: unknown): UpdateIntegrationDto => {
  if (!body || typeof body !== "object") {
    throw new AppError(400, "Request body is required", "VALIDATION_ERROR");
  }

  const { name, environment, domain, applicationUrl, allowedOrigins, description } = body as Record<
    string,
    unknown
  >;

  const dto: UpdateIntegrationDto = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new AppError(400, "name must be a non-empty string", "VALIDATION_ERROR");
    }
    dto.name = name.trim();
  }

  if (environment !== undefined) {
    if (
      typeof environment !== "string" ||
      !VALID_ENVIRONMENTS.includes(environment as SdkEnvironment)
    ) {
      throw new AppError(
        400,
        `environment must be one of: ${VALID_ENVIRONMENTS.join(", ")}`,
        "VALIDATION_ERROR",
      );
    }
    dto.environment = environment;
  }

  const targetDomain = applicationUrl !== undefined ? applicationUrl : domain;
  if (targetDomain !== undefined) {
    if (typeof targetDomain !== "string" || targetDomain.trim().length === 0) {
      throw new AppError(400, "applicationUrl must be a non-empty string", "VALIDATION_ERROR");
    }
    dto.domain = targetDomain.trim();
  }

  if (allowedOrigins !== undefined) {
    if (!Array.isArray(allowedOrigins)) {
      throw new AppError(400, "allowedOrigins must be an array of strings", "VALIDATION_ERROR");
    }
    dto.allowedOrigins = allowedOrigins.map((o) => {
      if (typeof o !== "string" || o.trim().length === 0) {
        throw new AppError(400, "allowedOrigins must contain non-empty strings", "VALIDATION_ERROR");
      }
      return o.trim();
    });
  }

  if (description !== undefined) {
    dto.description = typeof description === "string" ? description.trim() : "";
  }

  return dto;
};
