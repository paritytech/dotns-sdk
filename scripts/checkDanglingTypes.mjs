// Fails when an object shape is used inline in a position the coding standard
// requires to be a named type: a function parameter or return annotation, a
// type assertion (`as { ... }`), or a type argument (`Array<{ ... }>`,
// `Record<K, { ... }>`, `Promise<{ ... }>`, ...). Nested field shapes inside an
// already-named `type`/`interface` are fine, as is the documented Vue
// `defineProps`/`defineEmits`/`withDefaults` exception.
//
// AST-based (not regex) so it understands where a `{ ... }` sits. Runs under
// bun or node. Pass file paths to check a subset (the pre-commit hook passes
// `--staged`); pass none to walk the whole workspace.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const WORKSPACE_DIRS = ["packages"];
const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
  "generated",
  ".git",
]);
const DEFINE_MACROS = new Set(["defineProps", "defineEmits", "withDefaults"]);

function isCheckableFile(path) {
  return path.endsWith(".ts") || path.endsWith(".vue");
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_SEGMENTS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (isCheckableFile(full) && !full.endsWith(".d.ts")) out.push(full);
  }
}

function collectDefaultFiles() {
  const files = [];
  for (const dir of WORKSPACE_DIRS) {
    const abs = join(REPO_ROOT, dir);
    try {
      walk(abs, files);
    } catch {
      // Directory absent in this checkout; skip.
    }
  }
  return files;
}

// A .vue file is not valid TS on its own. Extract each <script> block and parse
// it in isolation, remembering the line offset so reported lines map back to
// the .vue file.
function extractScripts(source, path) {
  if (!path.endsWith(".vue")) return [{ text: source, lineOffset: 0 }];
  const blocks = [];
  const scriptBlock = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let match = scriptBlock.exec(source);
  while (match !== null) {
    const lineOffset = source.slice(0, match.index).split("\n").length - 1;
    blocks.push({ text: match[1], lineOffset });
    match = scriptBlock.exec(source);
  }
  return blocks;
}

// Is `node` (a TypeLiteral) a type argument of a defineProps/defineEmits/
// withDefaults call? Those are the sanctioned inline-type exception in Vue SFCs.
function isInsideVueMacro(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      if (DEFINE_MACROS.has(current.expression.text)) return true;
    }
  }
  return false;
}

// A TypeLiteral anywhere beneath a `type X = ...` or `interface X` is part of
// that named definition, however deeply nested, so it is not dangling.
function isInsideNamedType(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isTypeAliasDeclaration(current) ||
      ts.isInterfaceDeclaration(current)
    )
      return true;
  }
  return false;
}

// A parameter of an inline callback (an arrow or function expression passed
// directly as a call argument, e.g. `fn(x, (p: { ... }) => ...)`) is local and
// single-use; naming its shape adds noise rather than clarity. Named function
// and method signatures, returns, generics, and assertions are still flagged.
function isInlineCallbackParameter(parameter) {
  const fn = parameter.parent;
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)))
    return false;
  return Boolean(fn.parent) && ts.isCallExpression(fn.parent);
}

// Classify why a TypeLiteral is dangling, or return null if it sits in an
// allowed position (a named type/interface body, or a nested field shape).
function danglingReason(node) {
  const parent = node.parent;
  if (!parent) return null;
  if (isInsideNamedType(node)) return null;

  if (ts.isParameter(parent) && parent.type === node) {
    return isInlineCallbackParameter(parent) ? null : "parameter type";
  }
  if (ts.isTypeAssertionExpression?.(parent) && parent.type === node)
    return "type assertion";
  if (ts.isAsExpression(parent) && parent.type === node)
    return "type assertion";

  if (
    (ts.isFunctionDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isArrowFunction(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isCallSignatureDeclaration(parent) ||
      ts.isFunctionTypeNode(parent)) &&
    parent.type === node
  ) {
    return "return type";
  }

  // Type argument: `Array<{...}>`, `Record<K, {...}>`, `Promise<{...}>`,
  // `foo<{...}>()`. The TypeLiteral is an element of some node's typeArguments.
  const typeArgs = parent.typeArguments;
  if (typeArgs && typeArgs.some((arg) => arg === node)) return "type argument";

  return null;
}

function checkSource(text, path, lineOffset, findings) {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".vue") ? ts.ScriptKind.TS : undefined,
  );

  const visit = (node) => {
    if (ts.isTypeLiteralNode(node)) {
      const reason = danglingReason(node);
      if (reason && !isInsideVueMacro(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        findings.push({
          path,
          line: line + lineOffset + 1,
          reason,
          snippet: node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 72),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

// Line numbers added or changed on the new side of a diff, so a diff-scoped
// gate blocks only dangling types being introduced now, never pre-existing debt
// on untouched lines. Empty set on any git error (treated as "nothing newly
// added", so the file cannot block).
function diffAddedLines(file, range) {
  const added = new Set();
  let diff;
  try {
    diff = git(["diff", ...range, "--unified=0", "--", file]);
  } catch {
    return added;
  }
  const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  for (const line of diff.split("\n")) {
    const match = hunkHeader.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let n = start; n < start + count; n += 1) added.add(n);
  }
  return added;
}

function changedFiles(range) {
  try {
    return git(["diff", ...range, "--name-only", "--diff-filter=ACM"])
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => isCheckableFile(line));
  } catch {
    return [];
  }
}

// Resolve the value of a `--base <ref>` / `--base=<ref>` flag, or null.
function baseRef(argv) {
  const eq = argv.find((arg) => arg.startsWith("--base="));
  if (eq) return eq.slice("--base=".length);
  const idx = argv.indexOf("--base");
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return null;
}

function main() {
  const argv = process.argv.slice(2);
  const staged = argv.includes("--staged");
  const base = baseRef(argv);
  // The git range whose new-side lines a diff-scoped gate is allowed to fail on.
  const range = staged ? ["--cached"] : base ? [`${base}...HEAD`] : null;

  const args = argv.filter((arg) => isCheckableFile(arg));
  const files =
    args.length > 0
      ? args
      : range
        ? changedFiles(range)
        : collectDefaultFiles();
  const findings = [];

  for (const file of files) {
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const block of extractScripts(source, file)) {
      checkSource(block.text, file, block.lineOffset, findings);
    }
  }

  // Diff-scoped modes (--staged, --base) keep only findings on lines the change
  // adds or modifies, so pre-existing debt on untouched lines never blocks. This
  // enforces "no new dangling types" without a repo-wide retrofit first.
  let gated = findings;
  if (range) {
    const addedByFile = new Map();
    gated = findings.filter((finding) => {
      let added = addedByFile.get(finding.path);
      if (!added) {
        added = diffAddedLines(finding.path, range);
        addedByFile.set(finding.path, added);
      }
      return added.has(finding.line);
    });
  }

  if (gated.length === 0) {
    process.exit(0);
  }

  gated.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
  console.error(
    `Dangling inline types found (${gated.length}). Extract each into a named type:\n`,
  );
  for (const finding of gated) {
    const rel = relative(REPO_ROOT, finding.path);
    console.error(
      `  ${rel}:${finding.line}  (${finding.reason})  ${finding.snippet}`,
    );
  }
  console.error(
    "\nName each object shape as a `type`/`interface` alongside the signature it serves.",
  );
  process.exit(1);
}

main();
