// Fast SYNTAX check for the Mireli Driver backend AND the compliance console.
// No type graph — this parses each file in isolation, so it finishes in well
// under a second and does not need React/Next type definitions to load.
//
// WHY: full `tsc` on this project exceeds the command timeout here, and a
// killed run leaves an empty output file that reads as "0 errors" — a false
// pass. This check cannot silently no-op: it exits non-zero on any parse error.
//
// Run: node scripts/syntax-check.mjs
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

// Resolve TypeScript from the msafiri install: the driver workspace has no
// node_modules of its own, and installing a second copy just to run a syntax
// check would be wasteful.
const require = createRequire("C:/Users/SOOQ ELASER/Desktop/msafiri/package.json");
const ts = require("typescript/lib/typescript.js");

const CONSOLE_ROOT = "C:\\Users\\SOOQ ELASER\\Desktop\\mireli driver\\console";

const BACKEND = [
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

const targets = [
  ...BACKEND.map((r) => ({ root: "C:\\Users\\SOOQ ELASER\\Desktop\\msafiri", rel: r })),
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
  console.log(`missing (not built yet / wiped): ${missing.length}`);
}
process.exit(failures > 0 ? 1 : 0);
