// Finds `export`/`function` declarations that sit at a non-zero brace depth —
// i.e. illegally nested inside another function. This is the failure mode that
// produces "Modifiers cannot appear here" and "has no exported member" when a
// file is edited by inserting at a bad line boundary.
//
// A top-level declaration must be at depth 0. Anything else is a bug.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [
  "C:\\Users\\SOOQ ELASER\\Desktop\\msafiri\\src\\app\\api\\driver",
  "C:\\Users\\SOOQ ELASER\\Desktop\\msafiri\\src\\lib",
];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const n of entries) {
    if (n === "node_modules" || n === ".git" || n === ".next") continue;
    const full = join(dir, n);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (n.endsWith(".ts") || n.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

let problems = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    // Only the driver files we authored.
    if (!file.includes("driver")) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    let depth = 0;
    let inBlockComment = false;
    let inStr = null;

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      const isDecl =
        /^export\s+(async\s+)?function/.test(trimmed) ||
        /^export\s+(const|class|interface|type)\b/.test(trimmed) ||
        /^export\s+default\b/.test(trimmed);

      if (isDecl && depth !== 0) {
        problems++;
        console.log(
          `NESTED @ ${file.replace(/.*msafiri\\/, "")}:${i + 1}  depth=${depth}  ${trimmed.slice(0, 70)}`
        );
      }

      // Very small tokenizer: enough to keep strings/comments from skewing depth.
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        const next = line[c + 1];
        if (inBlockComment) {
          if (ch === "*" && next === "/") {
            inBlockComment = false;
            c++;
          }
          continue;
        }
        if (inStr) {
          if (ch === "\\") {
            c++;
            continue;
          }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === "/" && next === "*") {
          inBlockComment = true;
          c++;
          continue;
        }
        if (ch === "/" && next === "/") break;
        if (ch === '"' || ch === "'" || ch === "`") {
          inStr = ch;
          continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
    });

    if (depth !== 0) {
      problems++;
      console.log(`DEPTH ${depth} at EOF: ${file.replace(/.*msafiri\\/, "")}`);
    }
  }
}
console.log(`\n${problems} structural problem(s)`);