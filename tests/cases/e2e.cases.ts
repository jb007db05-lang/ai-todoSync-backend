import type { CatalogCase } from "../support/catalog.js";

/**
 * End-to-end scenarios run by tests/e2e/run-e2e.ts. Each scenario expands
 * into many checks at run time (one per guide, survey, batch, response…);
 * check ids are `<scenario>-NNNN` in the run report.
 */
export interface E2EScenario {
  id: string;
  title: string;
  steps: string;
  expected: string;
}

export const E2E_SCENARIOS: E2EScenario[] = [
  {
    id: "E2E-SET",
    title: "Setup: user, integration, sandbox, workspace",
    steps:
      "Register a throwaway user; create an SDK integration; create its sandbox; try a second sandbox; read the integration; find a workspace",
    expected:
      "Live key sdk_…, sandbox key sdk_test_… shown once; second sandbox refused (409); masked key in the integration",
  },
  {
    id: "E2E-AUT",
    title: "SDK authentication and origins",
    steps:
      "Handshake live and sandbox keys from the registered domain, localhost, 127.0.0.1 and a foreign site; call runtime with a raw unsigned key; signed runtime calls with both keys",
    expected:
      "Live key only from its domain; sandbox key also from localhost; unknown key 401; unsigned raw key 401; runtime reports the key's environment",
  },
  {
    id: "E2E-GDE",
    title: "Guides: create, transition, validate (×N)",
    steps:
      "Create N guides across 5 types with URL targeting, moving each to DRAFT/LIVE/PAUSED/ARCHIVED; try invalid transitions; publish a step-less guide; delete a live guide; malformed id; regex-special searches",
    expected:
      "All created; valid transitions apply; invalid ones 409; step-less guide 400; live delete 409; bad id 404; searches safe",
  },
  {
    id: "E2E-SRV",
    title: "Surveys: create and transition (×N)",
    steps:
      "Create N surveys of 3-6 mixed question types in every status; publish a one-option choice survey; move an archived survey to LIVE",
    expected:
      "All created and transitioned; unpublishable survey 400; archived→LIVE 409",
  },
  {
    id: "E2E-DLV",
    title: "Delivery by status and environment",
    steps:
      "For every guide and survey, trigger it manually through the live and the sandbox SDK; request runtime on each targeted URL section",
    expected:
      "Live sees only LIVE; sandbox sees LIVE and DRAFT; PAUSED/ARCHIVED never; URL targeting returns only matching, servable guides",
  },
  {
    id: "E2E-EVT",
    title: "Event tracking: volume, limits, isolation",
    steps:
      "Send N sandbox and N/2 live events in batches of 100; resend a batch; send /track, /page, /identify; oversized batch, oversized event, nameless event; compare dashboard counts per environment",
    expected:
      "Every event stored once with its environment; resends deduplicated; invalid requests 400; dashboard counts equal what was sent, separately for live and sandbox",
  },
  {
    id: "E2E-RSP",
    title: "Survey responses through the SDK",
    steps:
      "Submit several responses per survey per environment; retry with the same idempotency key; send invalid answers; compare response lists and NPS",
    expected:
      "Accepted only where the survey accepts responses (else 409); retries not duplicated; invalid answers 400; counts and NPS match per environment",
  },
  {
    id: "E2E-ANL",
    title: "Engagement analytics summary",
    steps: "Fetch the integration summary for live and sandbox",
    expected: "Response totals match per environment; sandbox MTU is 0",
  },
  {
    id: "E2E-SBX",
    title: "Sandbox lifecycle",
    steps:
      "Reset sandbox data; check responses; use the key after reset; regenerate the key; delete the sandbox",
    expected:
      "Reset clears only sandbox data; key still works; old key 401 after regeneration, new key works; deleted sandbox key 401; live data untouched",
  },
  {
    id: "E2E-PRM",
    title: "Prompt versions and deployment (×N)",
    steps:
      "For N prompts: create, edit to 3-5 versions, deploy directly, start a canary, promote, roll back, try a 100% canary and redeploying production",
    expected:
      "Edits never deploy; one production at a time; replaced production → staging; canary leaves production; rollback swaps; invalid deploys 400",
  },
  {
    id: "E2E-CLN",
    title: "Cleanup",
    steps:
      "Pause and delete every guide and survey, archive prompts, delete the integration (skipped with E2E_KEEP_DATA=1)",
    expected: "All test data removed",
  },
];

export const catalog = (): CatalogCase[] =>
  E2E_SCENARIOS.map((s) => ({
    id: s.id,
    module: "End-to-end",
    feature: s.title,
    title: s.title,
    preconditions: "Backend running (npm run dev) with MongoDB",
    steps: s.steps,
    expected: s.expected,
    level: "e2e" as const,
    automatedBy: "tests/e2e/run-e2e.ts",
  }));
