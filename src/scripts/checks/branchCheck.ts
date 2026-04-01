import { execSync } from "child_process";

if (process.env.CI === "true") {
  console.log("⚠️ Skipping branch check in CI");
  process.exit(0);
}

const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim(); // get current branch name

const validPattern = /^(feat|fix|hotFix|refactor|test)\/.+$/;

if (branch === "main" || branch === "development") {
  console.error("❌ Direct push to main/development is not allowed");
  process.exit(1);
}

if (!validPattern.test(branch)) {
  console.error(`❌ Invalid branch name: ${branch}`);
  console.error(
    "Expected:\nfeat/something, \nfix/something, \nhotFix/something, \nrefactor/something, \ntest/something",
  );
  process.exit(1);
}

console.log("✅ Branch name validation passed");
