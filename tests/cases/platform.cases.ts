import {
  describeValue,
  pad,
  pick,
  randomInt,
  randomString,
  seededRandom,
  type CatalogCase,
} from "../support/catalog.js";

const rand = seededRandom(424242);

// ---------------------------------------------------------------- signed requests
export interface SignedRequestCase {
  id: string;
  title: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  keyEnvironment: "live" | "sandbox";
}

const PATHS = [
  "/track",
  "/batch",
  "/page",
  "/identify",
  "/engagement/runtime",
  "/engagement/track",
  "/config",
  "/sdk-integrations/sdk/heartbeat",
];

const randomValue = (depth: number): unknown => {
  const kind = randomInt(rand, 0, depth > 2 ? 5 : 8);
  switch (kind) {
    case 0:
      return randomInt(rand, -1e6, 1e6);
    case 1:
      return rand() * 1000;
    case 2:
      return randomString(rand, randomInt(rand, 0, 30));
    case 3:
      return rand() > 0.5;
    case 4:
      return null;
    case 5:
      return new Date(
        Date.UTC(2026, randomInt(rand, 0, 11), randomInt(rand, 1, 28)),
      );
    case 6:
      return Array.from({ length: randomInt(rand, 0, 4) }, () =>
        randomValue(depth + 1),
      );
    default: {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < randomInt(rand, 0, 5); i++) {
        obj[randomString(rand, randomInt(rand, 1, 8), "abcdefghijXYZ_$")] =
          randomValue(depth + 1);
      }
      if (rand() > 0.8) obj.dropped = undefined; // undefined fields vanish on the wire
      return obj;
    }
  }
};

const signed: Array<Omit<SignedRequestCase, "id">> = [];
for (let i = 0; i < 200; i++) {
  const method = pick(rand, [
    "GET",
    "POST",
    "POST",
    "POST",
    "PUT",
    "DELETE",
  ] as const);
  let path = pick(rand, PATHS);
  if (rand() > 0.6) {
    const params = Array.from(
      { length: randomInt(rand, 1, 4) },
      () =>
        `${randomString(rand, randomInt(rand, 1, 5), "abcxyz")}=${encodeURIComponent(randomString(rand, randomInt(rand, 0, 6), "abc123 &=é"))}`,
    );
    path += `?${params.join("&")}`;
  }
  const body =
    method === "GET" || method === "DELETE"
      ? undefined
      : rand() > 0.1
        ? Object.fromEntries(
            Array.from({ length: randomInt(rand, 1, 6) }, (_, k) => [
              `f${k}`,
              randomValue(0),
            ]),
          )
        : {};
  signed.push({
    title: `${method} ${path.slice(0, 50)}${body !== undefined ? ` with ${describeValue(body).length}-byte body` : ""}`,
    method,
    path,
    body,
    keyEnvironment: i % 2 === 0 ? "sandbox" : "live",
  });
}
export const signedRequestCases: SignedRequestCase[] = signed.map((c, i) => ({
  id: `SDK-SIG-${pad(i + 1)}`,
  ...c,
}));

// ---------------------------------------------------------------- tampering
export type TamperKind =
  | "body-changed"
  | "body-field-added"
  | "path-changed"
  | "query-added"
  | "method-changed"
  | "timestamp-skewed"
  | "signature-altered"
  | "key-swapped"
  | "version-unsupported"
  | "header-missing"
  | "session-revoked"
  | "session-expired"
  | "origin-mismatch"
  | "nonce-replayed"
  | "environment-mismatch";

export interface TamperCase {
  id: string;
  kind: TamperKind;
  variant: number;
  error: RegExp;
}

const TAMPER_ERRORS: Record<TamperKind, RegExp> = {
  "body-changed": /Invalid body hash/,
  "body-field-added": /Invalid body hash/,
  "path-changed": /Invalid signature/,
  "query-added": /Invalid signature/,
  "method-changed": /Invalid signature/,
  "timestamp-skewed": /Expired timestamp/,
  "signature-altered": /Invalid signature/,
  "key-swapped": /SDK mismatch/,
  "version-unsupported": /Unsupported signature version/,
  "header-missing": /Missing cryptographic headers/,
  "session-revoked": /Session revoked/,
  "session-expired": /Session expired/,
  "origin-mismatch": /Invalid origin/,
  "nonce-replayed": /Reused nonce/,
  "environment-mismatch": /environment mismatch/,
};

export const tamperCases: TamperCase[] = (
  Object.keys(TAMPER_ERRORS) as TamperKind[]
)
  .flatMap((kind) =>
    Array.from({ length: 7 }, (_, variant) => ({ kind, variant })),
  )
  .map((c, i) => ({
    id: `SDK-TMP-${pad(i + 1)}`,
    ...c,
    error: TAMPER_ERRORS[c.kind],
  }));

// ---------------------------------------------------------------- origins
export interface OriginCase {
  id: string;
  origin: string;
  environment: "live" | "sandbox";
  allowed: boolean;
}
const integrationOrigins = {
  domain: "https://app.acme.com",
  allowedOrigins: ["https://staging.acme.com", "https://*.preview.acme.dev"],
};
const originRows: Array<[string, boolean, boolean]> = [
  // origin, allowed for live, allowed for sandbox
  ["https://app.acme.com", true, true],
  ["https://app.acme.com/", true, true],
  ["https://APP.ACME.COM", true, true],
  ["https://staging.acme.com", true, true],
  ["https://pr-12.preview.acme.dev", true, true],
  ["https://a.b.preview.acme.dev", true, true],
  ["http://app.acme.com", false, false],
  ["https://evil.com", false, false],
  ["https://app.acme.com.evil.com", false, false],
  ["https://acme.com", false, false],
  ["https://preview.acme.dev.attacker.io", false, false],
  ["http://localhost:3000", false, true],
  ["http://localhost:5173", false, true],
  ["http://127.0.0.1:8080", false, true],
  ["http://localhost", false, true],
  ["https://localhost.evil.com", false, false],
  ["not a url at all", false, false],
];
export const originCases: OriginCase[] = originRows
  .flatMap(([origin, live, sandbox]) => [
    { origin, environment: "live" as const, allowed: live },
    { origin, environment: "sandbox" as const, allowed: sandbox },
  ])
  .map((c, i) => ({ id: `SDK-ORG-${pad(i + 1)}`, ...c }));
export { integrationOrigins };

// ---------------------------------------------------------------- regex escaping
export interface EscapeCase {
  id: string;
  input: string;
}
export const escapeCases: EscapeCase[] = Array.from(
  { length: 120 },
  (_, i) => ({
    id: `PLT-ESC-${pad(i + 1)}`,
    input: randomString(rand, randomInt(rand, 1, 25)),
  }),
);

// ---------------------------------------------------------------- canary distribution
export interface CanaryCase {
  id: string;
  percentage: number;
}
export const canaryCases: CanaryCase[] = Array.from({ length: 99 }, (_, i) => ({
  id: `PRM-CAN-${pad(i + 1)}`,
  percentage: i + 1,
}));

// ---------------------------------------------------------------- deployment action sequences
export type DeployAction =
  | { op: "direct"; version: number }
  | { op: "canary"; version: number; percentage: number }
  | { op: "promote" }
  | { op: "abort" }
  | { op: "rollback" }
  | { op: "edit" };

export interface SequenceCase {
  id: string;
  actions: DeployAction[];
}

export const sequenceCases: SequenceCase[] = Array.from(
  { length: 150 },
  (_, i) => {
    const length = randomInt(rand, 3, 25);
    const actions: DeployAction[] = [];
    for (let k = 0; k < length; k++) {
      const op = pick(rand, [
        "direct",
        "canary",
        "canary",
        "promote",
        "abort",
        "rollback",
        "edit",
        "edit",
      ] as const);
      if (op === "direct") actions.push({ op, version: randomInt(rand, 1, 8) });
      else if (op === "canary")
        actions.push({
          op,
          version: randomInt(rand, 1, 8),
          percentage: randomInt(rand, 0, 100),
        });
      else actions.push({ op });
    }
    return { id: `PRM-SEQ-${pad(i + 1)}`, actions };
  },
);

const FILE = "tests/unit/platform.test.ts";

export const catalog = (): CatalogCase[] => [
  ...signedRequestCases.map((c) => ({
    id: c.id,
    module: "SDK",
    feature: "Request signing (SDK ↔ server parity)",
    title: c.title,
    preconditions: `SDK initialized with a ${c.keyEnvironment} key`,
    steps: `SDK signs and sends ${c.method} ${c.path}`,
    expected: `Server verifies the signature; request runs as ${c.keyEnvironment}`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...tamperCases.map((c) => ({
    id: c.id,
    module: "SDK",
    feature: "Request signing (tampering & replay)",
    title: `${c.kind} (variant ${c.variant + 1})`,
    preconditions: "A correctly signed request",
    steps: `Apply tampering: ${c.kind}`,
    expected: `Rejected with 401 (${c.error.source})`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...originCases.map((c) => ({
    id: c.id,
    module: "Sandbox",
    feature: "Origin rules",
    title: `${c.environment} key from ${c.origin}`,
    preconditions:
      "Integration domain app.acme.com; allowed staging.acme.com, *.preview.acme.dev",
    steps: `Authenticate the ${c.environment} key from ${c.origin}`,
    expected: c.allowed ? "Accepted" : "Rejected with 403 ORIGIN_NOT_ALLOWED",
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...escapeCases.map((c) => ({
    id: c.id,
    module: "Platform",
    feature: "Search input escaping",
    title: `Search for ${describeValue(c.input).slice(0, 40)}`,
    preconditions: "Guides/surveys/events list with search",
    steps: "Search with the input",
    expected: "Matched literally; no regex error or injection",
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...canaryCases.map((c) => ({
    id: c.id,
    module: "Prompt deployment",
    feature: "Canary traffic split",
    title: `Canary at ${c.percentage}%`,
    preconditions: `Prompt with a canary at ${c.percentage}%`,
    steps: "Resolve the prompt for 4,000 distinct users, twice each",
    expected: `${c.percentage}% ± 3 points get the canary; each user gets the same version both times`,
    level: "unit" as const,
    automatedBy: FILE,
  })),
  ...sequenceCases.map((c) => ({
    id: c.id,
    module: "Prompt deployment",
    feature: "Deployment state invariants",
    title: `${c.actions.length} random deploy actions`,
    preconditions: "Prompt with versions 1-8",
    steps: c.actions
      .map(
        (a) =>
          a.op +
          ("version" in a ? ` v${a.version}` : "") +
          ("percentage" in a ? ` ${a.percentage}%` : ""),
      )
      .join(" → ")
      .slice(0, 200),
    expected:
      "Exactly one production version; staging ≠ production; canary ≠ production with 1-99%; state matches the reference model after every step",
    level: "service" as const,
    automatedBy: FILE,
  })),
];
