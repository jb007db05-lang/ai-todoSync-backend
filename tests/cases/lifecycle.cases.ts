import type {
  GuideStatus,
  GuideType,
  TourStep,
} from "../../src/modules/engagement/types.js";
import { pad, type CatalogCase } from "../support/catalog.js";

const STATUSES: GuideStatus[] = ["DRAFT", "LIVE", "PAUSED", "ARCHIVED"];
const ALLOWED: Record<GuideStatus, GuideStatus[]> = {
  DRAFT: ["LIVE", "ARCHIVED"],
  LIVE: ["PAUSED", "ARCHIVED"],
  PAUSED: ["LIVE", "DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

// ---------------------------------------------------------------- transitions
export interface TransitionCase {
  id: string;
  kind: "Guide" | "Survey";
  from: GuideStatus;
  to: GuideStatus;
  allowed: boolean;
}

const transitions: Array<Omit<TransitionCase, "id">> = [];
for (const kind of ["Guide", "Survey"] as const) {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      transitions.push({
        kind,
        from,
        to,
        allowed: from === to || ALLOWED[from].includes(to),
      });
    }
  }
}
export const transitionCases: TransitionCase[] = transitions.map((c, i) => ({
  id: `LFC-TRN-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- guide publish checks
export interface GuidePublishCase {
  id: string;
  title: string;
  type: GuideType;
  steps: TourStep[];
  publishable: boolean;
  error?: RegExp;
}

const step = (id: string, extra: Partial<TourStep> = {}): TourStep => ({
  id,
  title: `Step ${id}`,
  placement: "BOTTOM",
  selector: `#el-${id}`,
  ...extra,
});

const publish: Array<Omit<GuidePublishCase, "id">> = [];
const TYPES: GuideType[] = ["TOUR", "SMART_TIP", "HOTSPOT", "BANNER", "MODAL"];
const ANCHORED = new Set<GuideType>(["TOUR", "SMART_TIP", "HOTSPOT"]);
for (const type of TYPES) {
  publish.push({
    title: `${type} with no steps`,
    type,
    steps: [],
    publishable: false,
    error: /at least one step/,
  });
  for (let n = 1; n <= 8; n++) {
    publish.push({
      title: `${type} with ${n} valid step(s)`,
      type,
      steps: Array.from({ length: n }, (_, i) =>
        step(`s${i}`, { nextStep: i < n - 1 ? `s${i + 1}` : null }),
      ),
      publishable: true,
    });
  }
  publish.push({
    title: `${type} step without selector`,
    type,
    steps: [step("s0", { selector: "" })],
    publishable: !ANCHORED.has(type),
    error: ANCHORED.has(type) ? /needs a target selector/ : undefined,
  });
  publish.push({
    title: `${type} centered step without selector`,
    type,
    steps: [step("s0", { selector: "", placement: "CENTER" })],
    publishable: true,
  });
  publish.push({
    title: `${type} step linking to a missing step`,
    type,
    steps: [step("s0", { nextStep: "ghost" })],
    publishable: false,
    error: /does not exist/,
  });
  for (const placement of ["TOP", "BOTTOM", "LEFT", "RIGHT", "AUTO"] as const) {
    publish.push({
      title: `${type} ${placement} step with selector`,
      type,
      steps: [step("s0", { placement })],
      publishable: true,
    });
  }
}
export const guidePublishCases: GuidePublishCase[] = publish.map((c, i) => ({
  id: `LFC-GPB-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- delivery by status and environment
export interface DeliveryCase {
  id: string;
  kind: "Guide" | "Survey";
  status: GuideStatus;
  environment: "live" | "sandbox";
  trigger: "automatic" | "manual";
  delivered: boolean;
}

const delivery: Array<Omit<DeliveryCase, "id">> = [];
for (const kind of ["Guide", "Survey"] as const) {
  for (const status of STATUSES) {
    for (const environment of ["live", "sandbox"] as const) {
      for (const trigger of ["automatic", "manual"] as const) {
        delivery.push({
          kind,
          status,
          environment,
          trigger,
          delivered:
            status === "LIVE" ||
            (environment === "sandbox" && status === "DRAFT"),
        });
      }
    }
  }
}
export const deliveryCases: DeliveryCase[] = delivery.map((c, i) => ({
  id: `LFC-DLV-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- deletion
export interface DeleteCase {
  id: string;
  status: GuideStatus;
  allowed: boolean;
}
export const deleteCases: DeleteCase[] = STATUSES.map((status, i) => ({
  id: `LFC-DEL-${pad(i + 1)}`,
  status,
  allowed: status !== "LIVE",
}));

// ---------------------------------------------------------------- survey response acceptance
export interface AcceptCase {
  id: string;
  status: GuideStatus;
  environment: "live" | "sandbox";
  accepted: boolean;
}
const accept: Array<Omit<AcceptCase, "id">> = [];
for (const status of STATUSES) {
  for (const environment of ["live", "sandbox"] as const) {
    accept.push({
      status,
      environment,
      accepted:
        status === "LIVE" ||
        status === "PAUSED" ||
        (environment === "sandbox" && status === "DRAFT"),
    });
  }
}
export const acceptCases: AcceptCase[] = accept.map((c, i) => ({
  id: `LFC-ACC-${pad(i + 1)}`,
  ...c,
}));

const FILE = "tests/unit/lifecycle.test.ts";

export const catalog = (): CatalogCase[] => [
  ...transitionCases.map((c) => ({
    id: c.id,
    module: c.kind === "Guide" ? "Guides" : "Surveys",
    feature: "Status transitions",
    title: `${c.kind} ${c.from} → ${c.to}`,
    preconditions: `Publishable ${c.kind.toLowerCase()} in ${c.from}`,
    steps: `Change status to ${c.to}`,
    expected: c.allowed
      ? `Status is ${c.to}`
      : "Rejected with 409 INVALID_STATUS_TRANSITION; status unchanged",
    level: "service" as const,
    automatedBy: FILE,
  })),
  ...guidePublishCases.map((c) => ({
    id: c.id,
    module: "Guides",
    feature: "Publishing rules",
    title: c.title,
    preconditions: `Draft ${c.type} guide with ${c.steps.length} step(s)`,
    steps: "Set status to LIVE",
    expected: c.publishable
      ? "Guide goes live"
      : `Rejected with 400 (${c.error?.source})`,
    level: "service" as const,
    automatedBy: FILE,
  })),
  ...deliveryCases.map((c) => ({
    id: c.id,
    module: c.kind === "Guide" ? "Guides" : "Surveys",
    feature: "Delivery by status and environment",
    title: `${c.status} ${c.kind.toLowerCase()} via ${c.environment} key (${c.trigger} trigger)`,
    preconditions: `${c.kind} in ${c.status}; SDK initialized with the ${c.environment} key`,
    steps:
      c.trigger === "manual"
        ? "Trigger manual_tour with the item id"
        : "Request runtime experiences",
    expected: c.delivered ? "Delivered to the user" : "Not delivered",
    level: "service" as const,
    automatedBy: FILE,
  })),
  ...deleteCases.map((c) => ({
    id: c.id,
    module: "Guides",
    feature: "Deletion",
    title: `Delete ${c.status} guide`,
    preconditions: `Guide in ${c.status}`,
    steps: "Delete the guide",
    expected: c.allowed ? "Deleted" : "Rejected with 409 GUIDE_LIVE",
    level: "service" as const,
    automatedBy: FILE,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `LFC-IDM-${pad(i + 1)}`,
    module: "Surveys",
    feature: "Response idempotency",
    title: `${((i + 1) % 5) + 1} concurrent submissions + 1 retry with the same idempotency key`,
    preconditions: "LIVE survey",
    steps:
      "Submit the same response concurrently, then retry it with the same idempotency key",
    expected:
      "One response stored; the retry returns the original (duplicate: true)",
    level: "service" as const,
    automatedBy: FILE,
  })),
  ...acceptCases.map((c) => ({
    id: c.id,
    module: "Surveys",
    feature: "Response acceptance",
    title: `Response to ${c.status} survey via ${c.environment} key`,
    preconditions: `Survey in ${c.status}`,
    steps: "Submit a valid response",
    expected: c.accepted ? "Stored (201)" : "Rejected with 409 SURVEY_CLOSED",
    level: "service" as const,
    automatedBy: FILE,
  })),
];
