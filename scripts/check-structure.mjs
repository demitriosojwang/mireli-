// Ad-hoc structural checker for the Mireli Driver backend + Android sources.
// Run: node scripts/check-structure.mjs
//
// Why this exists: the repo has no node_modules installed, so `tsc` cannot run.
// A missing or duplicated brace is the failure mode we actually hit while
// writing these files, and it is 100% catchable without a compiler.
//
// This is NOT a type checker. It catches structural corruption only. Run a real
// `tsc --noEmit` and a real Gradle build once dependencies are installed.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BACKEND = "C:\\Users\\SOOQ ELASER\\Desktop\\msafiri";
const ANDROID = "C:\\Users\\SOOQ ELASER\\Desktop\\mireli driver";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "build", ".gradle"]);

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

/** Strips strings and comments so braces inside them are not counted. */
function stripNoise(src) {
  let out = src;
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");            // block comments
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");        // line comments (keep https://)
  out = out.replace(/"""[\s\S]*?"""/g, '""');           // Kotlin raw strings
  out = out.replace(/<([!?\/])(?:[\s\S]*?)\1>/g, "");  // XML tags
  out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');       // double-quoted
  out = out.replace(/'(?:[^'\\\n]|\\.)*'/g, "''");        // single-quoted
  return out;
}

const targets = [
  ...walk(join(BACKEND, "src", "app", "api", "driver")),
  join(BACKEND, "src", "lib", "driver-auth.ts"),
  join(BACKEND, "src", "lib", "driver-ops.ts"),
  ...walk(join(ANDROID, "android")),
];

const EXT = new Set([".ts", ".kt", ".kts", ".xml"]);
let failures = 0;
let checked = 0;

for (const file of targets) {
  const dot = file.lastIndexOf(".");
  const ext = file.slice(dot);
  if (!EXT.has(ext)) continue;
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const clean = stripNoise(src);
  let depth = 0;
  let wentNegative = false;
  for (const ch of clean) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) wentNegative = true;
    }
  }
  checked++;
  const label = file.replace(BACKEND, "msafiri").replace(ANDROID, "driver-workspace");
  if (depth !== 0 || wentNegative) {
    failures++;
    console.log(`UNBALANCED  ${label}  finalDepth=${depth}  wentNegative=${wentNegative}`);
  }
}

console.log(`\nchecked ${checked} files — ${failures} structurally broken`);
process.exit(failures > 0 ? 1 : 0);