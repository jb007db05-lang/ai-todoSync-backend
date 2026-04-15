import { execSync } from "child_process";

if (process.env.CI === "true") {
  process.stdout.write("⚠️ Skipping branch check in CI" + "\n");
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

process.stdout.write("✅ Branch name validation passed" + "\n");
