// Focused typecheck for the Mireli Driver backend, using the TypeScript
// compiler API in a single process.
//
// WHY: `tsc` on the whole project takes longer than the shell timeout here, and
// background/redirect invocations kept getting cut off mid-run — which produced
// misleading "0 errors" results from an output file that was never written.
// This runs in one process and always reports.
//
// Run: node scripts/typecheck-driver.mjs
import ts from "typescript";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "C:\\Users\\SOOQ ELASER\\Desktop\\msafiri";

// Only the driver surface: the files this work added or changed. Checking the
// whole tree drowns real errors in archived `upload/` and `examples/` code that
// has its own missing dependencies and is not part of the app.
const TARGETS = [
  "src/lib/driver-auth.ts",
  "src/lib/driver-ops.ts",
  "src/lib/driver-onboarding.ts",
  "src/lib/audit.ts",
  "src/app/api/driver/auth/route.ts",
  "src/app/api/driver/me/route.ts",
  "src/app/api/driver/assignments/route.ts",
  "src/app/api/driver/assignments/[tripId]/manifest/route.ts",
  "src/app/api/driver/assignments/[tripId]/boardings/route.ts",
  "src/app/api/driver/earnings/route.ts",
  "src/app/api/driver/offers/route.ts",
  "src/app/api/driver/offers/[id]/respond/route.ts",
  "src/app/api/driver/onboarding/route.ts",
  "src/app/api/driver/onboarding/documents/route.ts",
  "src/app/api/driver/charter-subscription/route.ts",
  "src/app/api/admin/onboarding/route.ts",
];

const configPath = join(ROOT, "tsconfig.json");
const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);

const files = TARGETS.map((t) => join(ROOT, t)).filter((f) => {
  try {
    return statSync(f).isFile();
  } catch {
    console.log(`MISSING TARGET: ${relative(ROOT, f)}`);
    return false;
  }
});

const program = ts.createProgram({
  rootNames: files,
  options: {
    ...parsed.options,
    noEmit: true,
    incremental: false,
    types: ["node"],
  },
});

const diagnostics = ts.getPreEmitDiagnostics(program);

// Suppress the archived-tree noise: any diagnostic whose file is NOT one of our
// targets is reported separately, not silently dropped.
const targetSet = new Set(files.map((f) => f.replace(/\\/g, "/")));
const mine = [];
const elsewhere = [];

for (const d of diagnostics) {
  const file = d.file?.fileName?.replace(/\\/g, "/") ?? "";
  if (targetSet.has(file)) mine.push(d);
  else elsewhere.push(d);
}

const fmt = (d) => {
  const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
  if (!d.file || d.start === undefined) return `  [global] ${msg}`;
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  return `  ${relative(ROOT, d.file.fileName).replace(/\\/g, "/")}(${line + 1},${character + 1}): TS${d.code}: ${msg}`;
};

if (elsewhere.length) {
  console.log(`--- ${elsewhere.length} pre-existing error(s) in files outside this change ---`);
  [...new Set(elsewhere.map((d) => d.file?.fileName ?? "?"))]
    .slice(0, 6)
    .forEach((f) => console.log(`    ${relative(ROOT, f)}`));
  console.log("");
}

if (mine.length) {
  console.log(`--- ${mine.length} ERROR(S) IN DRIVER CODE ---`);
  mine.forEach((d) => console.log(fmt(d)));
  process.exit(1);
} else {
  console.log(`driver typecheck PASSED — ${files.length} files, 0 errors`);
}