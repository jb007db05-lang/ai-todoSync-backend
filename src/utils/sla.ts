import type { TaskPriority, TaskSlaState } from "../models/task.model.js";

export const SLA_PRIORITIES: TaskPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export const DEFAULT_SLA_CONFIG: Record<
  TaskPriority,
  { responseTimeHours: number; resolutionTimeHours: number }
> = {
  LOW: { responseTimeHours: 24, resolutionTimeHours: 120 },
  MEDIUM: { responseTimeHours: 8, resolutionTimeHours: 72 },
  HIGH: { responseTimeHours: 2, resolutionTimeHours: 24 },
  CRITICAL: { responseTimeHours: 0.5, resolutionTimeHours: 4 },
};

export const SLA_NEAR_BREACH_RATIO = 0.2;
export const HOUR_MS = 60 * 60 * 1000;

export const addHours = (date: Date, hours: number): Date =>
  new Date(date.getTime() + hours * HOUR_MS);

export const addMilliseconds = (
  date: Date | null | undefined,
  ms: number,
): Date | null => (date ? new Date(date.getTime() + ms) : null);

export const getRemainingMs = (
  dueAt: Date | null | undefined,
  now: Date,
): number | null => (dueAt ? dueAt.getTime() - now.getTime() : null);

export const isNearBreach = (
  createdAt: Date,
  dueAt: Date | null | undefined,
  now: Date,
): boolean => {
  if (!dueAt) {
    return false;
  }

  const totalMs = dueAt.getTime() - createdAt.getTime();
  const remainingMs = dueAt.getTime() - now.getTime();

  return (
    totalMs > 0 &&
    remainingMs > 0 &&
    remainingMs <= totalMs * SLA_NEAR_BREACH_RATIO
  );
};

export const deriveSlaState = (input: {
  status: string;
  isPaused: boolean;
  responseBreached: boolean;
  resolutionBreached: boolean;
  createdAt: Date;
  responseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  now: Date;
}): TaskSlaState => {
  if (input.status === "DONE") {
    return "COMPLETED";
  }

  if (input.isPaused) {
    return "PAUSED";
  }

  if (input.responseBreached || input.resolutionBreached) {
    return "BREACHED";
  }

  if (
    isNearBreach(input.createdAt, input.responseDueAt, input.now) ||
    isNearBreach(input.createdAt, input.resolutionDueAt, input.now)
  ) {
    return "NEAR_BREACH";
  }

  return "HEALTHY";
};
