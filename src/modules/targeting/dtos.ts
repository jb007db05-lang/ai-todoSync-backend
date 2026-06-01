import type {
  GuideEligibilityResult,
  TargetingRuleGroup,
  TargetingRuntimeContext,
} from "../engagement/types.js";

export interface CreateTargetingSegmentDto {
  name: string;
  description?: string;
  rules: TargetingRuleGroup;
}

export interface UpdateTargetingSegmentDto {
  name?: string;
  description?: string;
  rules?: TargetingRuleGroup;
}

export interface EvaluateRulesDto extends TargetingRuntimeContext {
  rules: TargetingRuleGroup;
  guideId?: string;
}

export interface EvaluateRulesResponseDto extends GuideEligibilityResult {}
