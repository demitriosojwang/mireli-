// Fast SYNTAX check for the Mireli Driver backend AND the compliance console.
// No type graph â€” this parses each file in isolation, so it finishes in well
// under a second and does not need React/Next type definitions to load.
//
// WHY: full `tsc` on this project exceeds the command timeout here, and a
// killed run leaves an empty output file that reads as "0 errors" â€” a false
// pass. This check cannot silently no-op: it exits non-zero on any parse error.
//
// Run: node scripts/syntax-check.mjs
import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

// Resolve TypeScript from the msafiri install: the driver workspace has no
// node_modules of its own, and installing a second copy just to run a syntax
// check would be wasteful.
const require = createRequire("C:/Users/SOOQ ELASER/Desktop/msafiri/package.json");
const ts = require("typescript/lib/typescript.js");

const CONSOLE_ROOT = "C:\\Users\\SOOQ ELASER\\Desktop\\mireli driver\\console";
const BACKEND_ROOT = "C:\\Users\\SOOQ ELASER\\Desktop\\mireli driver\\backend";

// Documents the driver-facing surface this backend must expose. Kept as a list
// so a missing route is reported rather than silently skipped.
const EXPECTED_ROUTES = [
  "src/app/api/driver/auth/route.ts",
  "src/app/api/driver/me/route.ts",
  "src/app/api/driver/offers/route.ts",
  "src/app/api/driver/offers/[id]/respond/route.ts",
  "src/app/api/driver/onboarding/route.ts",
  "src/app/api/driver/onboarding/documents/route.ts",
  "src/app/api/driver/assignments/route.ts",
  "src/app/api/driver/assignments/[tripId]/manifest/route.ts",
  "src/app/api/driver/assignments/[tripId]/boardings/route.ts",
  "src/app/api/driver/earnings/route.ts",
  "src/app/api/driver/charter-subscription/route.ts",
  "src/app/api/admin/onboarding/route.ts",
];

/** Walk the console for .ts/.tsx, skipping config files. */
function walkConsole(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const full = join(dir, n);
    if (statSync(full).isDirectory()) walkConsole(full, acc);
    else if (/\.(ts|tsx)$/.test(n) && n !== "tailwind.config.ts") acc.push(full);
  }
  return acc;
}

/** Walk the standalone backend for .ts/.tsx. */
function walkBackend(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const full = join(dir, n);
    if (statSync(full).isDirectory()) walkBackend(full, acc);
    else if (/\.(ts|tsx)$/.test(n)) acc.push(full);
  }
  return acc;
}

const targets = [
  // The driver backend lives in THIS repo, not in msafiri.
  ...walkBackend(BACKEND_ROOT).map((f) => ({
    root: BACKEND_ROOT,
    rel: relative(BACKEND_ROOT, f),
  })),
  ...walkConsole(CONSOLE_ROOT).map((f) => ({
    root: CONSOLE_ROOT,
    rel: relative(CONSOLE_ROOT, f),
  })),
];

const missing = [];
let failures = 0;
let checked = 0;

for (const { root, rel } of targets) {
  const full = join(root, rel);
  // Tolerant of missing files: the backend was wiped by an external process
  // during this session. A hard throw here would hide the console's result,
  // which is the part still under construction.
  let src;
  try {
    if (!statSync(full).isFile()) throw new Error("not a file");
    src = readFileSync(full, "utf8");
  } catch {
    missing.push(rel);
    continue;
  }

  const out = ts.transpileModule(src, {
    fileName: full,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
      isolatedModules: true,
    },
  });

  checked++;
  const errs = (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errs.length) {
    failures++;
    const sf = ts.createSourceFile(full, src, ts.ScriptTarget.ES2022);
    console.log(`\nSYNTAX ERRORS in ${rel}:`);
    for (const d of errs) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
      const pos =
        d.start !== undefined ? ts.getLineAndCharacterOfPosition(sf, d.start) : { line: 0, character: 0 };
      console.log(`  line ${pos.line + 1}:${pos.character + 1}  TS${d.code}  ${msg}`);
    }
  }
}

console.log(`\nsyntax check: ${checked} files, ${failures} with errors`);

if (missing.length) {
  console.log(`missing: ${missing.length}`);
}

// Report which routes are not built yet, so the surface gap is explicit rather
// than something you discover when the app 404s.
const routeSet = new Set(
  walkBackend(join(BACKEND_ROOT, "src")).map((f) =>
    relative(join(BACKEND_ROOT, "src"), f).replace(/\\/g, "/")
  )
);
const todo = EXPECTED_ROUTES.filter((r) => !routeSet.has(r.replace(/\\/g, "/")));
if (todo.length) {
  console.log(`\nAPI routes not built yet (${todo.length}):`);
  todo.forEach((r) => console.log(`  ${r}`));
}

process.exit(failures > 0 ? 1 : 0);

