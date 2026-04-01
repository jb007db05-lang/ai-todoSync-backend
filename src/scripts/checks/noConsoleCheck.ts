import fs from "fs";
import path from "path";

const IGNORE_FOLDERS = ["node_modules", "dist", "src/scripts/checks"];

function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);

    if (IGNORE_FOLDERS.some((folder) => fullPath.includes(folder))) {
      return [];
    }

    if (fs.statSync(fullPath).isDirectory()) {
      return walk(fullPath);
    }

    return [fullPath];
  });
}

// Get filepath of each file in the src folder and get only .ts files
const files = walk(path.join(process.cwd(), "src")).filter((file) =>
  file.endsWith(".ts"),
);

let hasError = false;

for (const file of files) {
  const content = fs.readFileSync(file, "utf-8");

  if (content.includes("console.log")) {
    console.error(`❌ Found console.log in : ${file}`);
    hasError = true;
  }
}

if (hasError) {
  console.error("\n❌ Remove console.log statements before committing.");
  process.exit(1);
}

console.log("✅ Console.log validation passed");
