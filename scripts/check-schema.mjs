// Structural checker for prisma/schema.prisma — verifies that every `model`
// block and every `{ ... }` braces balance, and that relation fields point at
// models which actually exist. Catches the failure mode that a plain brace
// counter misses: a model body that was truncated by an edit.
import { readFileSync } from "node:fs";

const FILE = "C:\\Users\\SOOQ ELASER\\Desktop\\msafiri\\prisma\\schema.prisma";
const src = readFileSync(FILE, "utf8");

// Balance check ignoring // and /// comments.
const clean = src
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

let depth = 0;
let negative = false;
for (const ch of clean) {
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth < 0) negative = true;
  }
}

const models = [...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
const modelBlocks = [...clean.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);

let failures = 0;
if (depth !== 0 || negative) {
  console.log(`UNBALANCED braces in schema.prisma — finalDepth=${depth}`);
  failures++;
}
if (models.length !== modelBlocks.length) {
  console.log(`model count mismatch after comment-strip: ${models.length} vs ${modelBlocks.length}`);
  failures++;
}

// Every relation field `X Model[]` or `X Model @relation` must reference a
// declared model. A typo here is a runtime Prisma error, not a parse error.
const known = new Set(models);
for (const m of clean.matchAll(/^\s+\w+\s+(\w+)(\[\])?\s*(?:@|$)/gm)) {
  const target = m[1];
  if (
    ["String", "Int", "Float", "Boolean", "DateTime", "Json"].includes(target)
  )
    continue;
  if (!known.has(target)) {
    console.log(`UNKNOWN relation target: "${target}" (not a declared model)`);
    failures++;
  }
}

console.log(`schema.prisma: ${models.length} models declared, ${failures} problem(s)`);
process.exit(failures > 0 ? 1 : 0);