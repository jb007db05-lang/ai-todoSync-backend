# Tests: guides, surveys, events, sandbox, SDK, prompts

| Command                   | What it runs                                                                     | Needs                        |
| ------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `npm run test:unit`       | ~1,800 table-driven cases in `tests/unit/`                                       | nothing (models are stubbed) |
| `npm run test:engagement` | the original suites in `src/modules/**/*.test.ts`                                | nothing                      |
| `npm run test:e2e`        | ~1,500 live checks against a running backend                                     | backend + MongoDB            |
| `npm run test:smoke`      | live checks for the Events page API, ingestion rules and the portal runtime      | backend + MongoDB            |
| `npm run test:catalog`    | regenerates `tests/TEST_CASES.csv`                                               | nothing                      |
| `npm run db:indexes`      | builds MongoDB indexes (merges blocking duplicates first; `-- --dry` to preview) | MongoDB                      |

## Layout

- `cases/` — case tables. Each file exports the data the tests run **and** a `catalog()` that turns the same data into catalog rows, so `TEST_CASES.csv` always matches what is executed.
- `unit/` — tests that iterate the case tables. No database: Mongoose models are replaced with `support/stubs.ts`.
- `e2e/run-e2e.ts` — the end-to-end run; reports go to `e2e/reports/` (git-ignored).
- `catalog/generate-catalog.ts` — writes the CSV.

## Unit suites

| File                     | Cases | Covers                                                                                                                                                                                                                                |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `survey-answers.test.ts` | 311   | every question type's accepted/rejected answers, required/branching rules, publish rules                                                                                                                                              |
| `targeting.test.ts`      | 395   | every condition type × operator, AND/OR/nested groups, schedules, behavioral event counts (scoped to integration + environment), frequency caps                                                                                       |
| `lifecycle.test.ts`      | 211   | all guide/survey status transitions, guide publish rules, delivery by status × environment × trigger, deletion, response acceptance, idempotency                                                                                      |
| `events.test.ts`         | 207   | event validation/normalization (incl. 150 generated events), batch limits, live/sandbox storage                                                                                                                                       |
| `platform.test.ts`       | 708   | 200 generated signed SDK requests verified by the real server code, 105 tampering/replay cases, origin rules, regex escaping, canary split at 1–99%, 150 random prompt-deployment sequences checked against a reference model         |
| `hardening.test.ts`      | 60    | exposure status never downgraded, schedule time windows (incl. time zones/overnight), explicit targeting operators, rule validation, ingestion time window/import/$insert_id, profile trait merging, event-stream mapping and cursors |

Generated cases use a fixed seed, so they are identical on every run.

## End-to-end run

```bash
npm run dev            # in one terminal (or: npx tsc -p . && node dist/server.js)
npm run test:e2e       # in another
```

It registers a throwaway user (`e2e-…@example.test`), creates an integration with a sandbox, then:

1. checks key/origin authentication for live and sandbox keys,
2. creates 120 guides and 60 surveys in every status and checks transitions and validation,
3. triggers every guide and survey through the live and the sandbox SDK and checks who sees what,
4. sends 1,500 events (sandbox + live) in batches and checks the dashboard counts per environment,
5. submits survey responses through the SDK and checks counts, NPS, idempotency and validation,
6. resets, rotates and deletes the sandbox and checks live data is untouched,
7. creates 40 prompts with 3–5 versions each and walks direct deploy → canary → promote → rollback,
8. deletes everything it created (set `E2E_KEEP_DATA=1` to keep it and look at it in the portal).

Scale it with `E2E_GUIDES`, `E2E_SURVEYS`, `E2E_EVENTS`, `E2E_RESPONSES`, `E2E_PROMPTS`; point it elsewhere with `E2E_API_URL`. The test user itself is not deleted (there is no delete-account endpoint).

## Adding cases

Add rows to the relevant table in `cases/`; the unit test and the catalog pick them up. For a new area, add a `cases/<area>.cases.ts` exporting the data and a `catalog()`, a `unit/<area>.test.ts`, and register the catalog in `catalog/generate-catalog.ts`.
