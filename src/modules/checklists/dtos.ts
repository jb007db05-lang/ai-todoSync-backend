import type {
  ChecklistItem,
  FrequencyRules,
  GuidePriority,
  GuideStatus,
  ScheduleRules,
  TargetingRuleGroup,
} from "../engagement/types.js";

export interface CreateChecklistDto {
  title: string;
  description?: string;
  status?: GuideStatus;
  priority?: GuidePriority;
  items: ChecklistItem[];
  targetingRules?: TargetingRuleGroup | null;
  frequencyRules?: FrequencyRules;
  scheduleRules?: ScheduleRules;
  estimatedMinutes?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateChecklistDto extends Partial<CreateChecklistDto> {}

export interface ChecklistQueryDto {
  status?: GuideStatus;
  search?: string;
}

export interface ChecklistEventDto {
  eventName: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
}
