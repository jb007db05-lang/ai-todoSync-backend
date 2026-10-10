import type { Request, Response } from "express";
import { isAppError } from "../../utils/app-error.js";
import { AppError } from "../../utils/app-error.js";
import { parseEnvironment } from "../../shared/environment.js";
import logger from "../../lib/logger.js";
import eventsService, { type StreamFilters } from "./service.js";

const text = (value: unknown, max = 500): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new AppError(400, "Query value is too long", "INVALID_QUERY");
  }
  return trimmed;
};

const list = (value: unknown): string[] =>
  (text(value, 10_000) ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 100);

const parseFilters = (query: Request["query"]): StreamFilters => ({
  eventNames: list(query.eventNames),
  q: text(query.q),
  distinctId: text(query.distinctId),
  userId: text(query.userId),
  deviceId: text(query.deviceId),
  propertyKey: text(query.propertyKey, 200),
  propertyValue: text(query.propertyValue),
  startDate: text(query.startDate, 40),
  endDate: text(query.endDate, 40),
});

const integrationId = (req: Request): string =>
  req.sdkIntegration?._id?.toString() ?? String(req.params.sdkIntegrationId);

const LEXICON_LIMITS = {
  displayName: 120,
  description: 2000,
  tags: 20,
  tagLength: 40,
};

class EventsController {
  public stream = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Number(text(req.query.limit, 10) ?? 50);
      const data = await eventsService.stream(
        integrationId(req),
        parseEnvironment(req.query.environment),
        parseFilters(req.query),
        {
          before: text(req.query.before, 200),
          since: text(req.query.since, 40),
          limit: Number.isFinite(limit) ? limit : 50,
        },
      );
      res.status(200).json({ data });
    } catch (error) {
      this.respondError(res, error, "Could not load events");
    }
  };

  public exportCsv = async (req: Request, res: Response): Promise<void> => {
    try {
      const { csv, rows } = await eventsService.exportCsv(
        integrationId(req),
        parseEnvironment(req.query.environment),
        parseFilters(req.query),
        {
          columns: list(req.query.columns),
          allProperties: req.query.allProperties === "true",
        },
      );
      const day = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="events-${day}.csv"`,
      );
      res.setHeader("X-Row-Count", String(rows));
      res.status(200).send(csv);
    } catch (error) {
      this.respondError(res, error, "Could not export events");
    }
  };

  public propertyKeys = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await eventsService.propertyKeys(
        integrationId(req),
        parseEnvironment(req.query.environment),
      );
      res.status(200).json({ data });
    } catch (error) {
      this.respondError(res, error, "Could not load event properties");
    }
  };

  public userProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const distinctId = text(req.params.distinctId);
      if (!distinctId) {
        throw new AppError(400, "distinctId is required", "INVALID_USER");
      }
      const data = await eventsService.userProfile(
        integrationId(req),
        parseEnvironment(req.query.environment),
        distinctId,
      );
      res.status(200).json({ data });
    } catch (error) {
      this.respondError(res, error, "Could not load this user");
    }
  };

  public lexicon = async (req: Request, res: Response): Promise<void> => {
    try {
      const events = await eventsService.lexicon(
        integrationId(req),
        parseEnvironment(req.query.environment),
      );
      res.status(200).json({ data: { events } });
    } catch (error) {
      this.respondError(res, error, "Could not load the lexicon");
    }
  };

  public updateLexiconEvent = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: {
        displayName?: string;
        description?: string;
        hidden?: boolean;
        tags?: string[];
      } = {};

      for (const field of ["displayName", "description"] as const) {
        if (field in body) {
          if (typeof body[field] !== "string") {
            throw new AppError(400, `${field} must be text`, "INVALID_FIELD");
          }
          const value = (body[field] as string).trim();
          if (value.length > LEXICON_LIMITS[field]) {
            throw new AppError(
              400,
              `${field} must be at most ${LEXICON_LIMITS[field]} characters`,
              "INVALID_FIELD",
            );
          }
          patch[field] = value;
        }
      }
      if ("hidden" in body) {
        if (typeof body.hidden !== "boolean") {
          throw new AppError(
            400,
            "hidden must be true or false",
            "INVALID_FIELD",
          );
        }
        patch.hidden = body.hidden;
      }
      if ("tags" in body) {
        if (
          !Array.isArray(body.tags) ||
          body.tags.some((t) => typeof t !== "string")
        ) {
          throw new AppError(
            400,
            "tags must be a list of text",
            "INVALID_FIELD",
          );
        }
        const tags = [
          ...new Set(
            (body.tags as string[]).map((t) => t.trim()).filter(Boolean),
          ),
        ];
        if (
          tags.length > LEXICON_LIMITS.tags ||
          tags.some((t) => t.length > LEXICON_LIMITS.tagLength)
        ) {
          throw new AppError(
            400,
            `Use at most ${LEXICON_LIMITS.tags} tags of up to ${LEXICON_LIMITS.tagLength} characters`,
            "INVALID_FIELD",
          );
        }
        patch.tags = tags;
      }

      const data = await eventsService.updateLexiconEvent(
        integrationId(req),
        String(req.params.eventId),
        patch,
      );
      res.status(200).json({ data });
    } catch (error) {
      this.respondError(res, error, "Could not update this event");
    }
  };

  private respondError(res: Response, error: unknown, message: string): void {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    logger.error(message, error instanceof Error ? error : undefined);
    res.status(500).json({ error: message });
  }
}

export default new EventsController();
