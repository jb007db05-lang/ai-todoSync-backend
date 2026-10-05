/**
 * Writes tests/TEST_CASES.csv: one row per automated test case, generated
 * from the same case tables the tests run, plus the end-to-end scenarios.
 *
 *   npm run test:catalog
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogCase } from "../support/catalog.js";
import { catalog as surveyAnswers } from "../cases/survey-answers.cases.js";
import { catalog as targeting } from "../cases/targeting.cases.js";
import { catalog as lifecycle } from "../cases/lifecycle.cases.js";
import { catalog as events } from "../cases/events.cases.js";
import { catalog as platform } from "../cases/platform.cases.js";
import { catalog as e2e } from "../cases/e2e.cases.js";

const rows: CatalogCase[] = [
  ...lifecycle(),
  ...surveyAnswers(),
  ...targeting(),
  ...events(),
  ...platform(),
  ...e2e(),
];

const ids = new Set<string>();
for (const row of rows) {
  if (ids.has(row.id)) throw new Error(`Duplicate case id ${row.id}`);
  ids.add(row.id);
}

const COLUMNS: Array<keyof CatalogCase> = [
  "id",
  "module",
  "feature",
  "title",
  "preconditions",
  "steps",
  "expected",
  "level",
  "automatedBy",
];
const HEADERS = [
  "ID",
  "Module",
  "Feature",
  "Test case",
  "Preconditions",
  "Steps",
  "Expected result",
  "Level",
  "Automated by",
];

const cell = (value: unknown): string => {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csv = [
  HEADERS.join(","),
  ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(",")),
].join("\n");
const out = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../TEST_CASES.csv",
);
// BOM so Excel opens UTF-8 (✓, →, emoji) correctly.
fs.writeFileSync(out, `\uFEFF${csv}\n`);

const byModule = new Map<string, number>();
rows.forEach((r) => byModule.set(r.module, (byModule.get(r.module) ?? 0) + 1));
console.log(`Wrote ${rows.length} test cases to tests/TEST_CASES.csv`);
for (const [module, count] of [...byModule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${module.padEnd(20)} ${count}`);
}
