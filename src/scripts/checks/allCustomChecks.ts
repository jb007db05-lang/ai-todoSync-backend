import { execSync } from "child_process";

const checks = [
  "node dist/scripts/checks/envCheck.js",
  "node dist/scripts/checks/branchCheck.js",
  "node dist/scripts/checks/noConsoleCheck.js",
];

for (const check of checks) {
  try {
    console.log(`🔍 Running: ${check}`);
    execSync(check, { stdio: "inherit" });
  } catch {
    console.error(`❌ Failed: ${check}`);
    process.exit(1);
  }
}

console.log("✅ All checks passed");
