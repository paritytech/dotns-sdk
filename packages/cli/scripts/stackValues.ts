// Prints every value of each bundled stack descriptor, for the stack update pull request.
//
//   bun scripts/stackValues.ts > before.json
//   bun scripts/stackValues.ts --compare before.json   # the pull request body, in Markdown

import { formatErrorMessage } from "../src/utils/formatting";

type Values = Record<string, Record<string, string>>;

// Array entries are keyed by their `role` or `kind` when unique, so a diff reads
// `chains.Bulletin.rpc` instead of `chains.3.rpc`.
function readEntryKey(entry: unknown, index: number, siblings: unknown[]): string {
  for (const field of ["role", "kind"]) {
    const key = (entry as Record<string, unknown> | null)?.[field];
    const isUnique =
      siblings.filter((sibling) => (sibling as Record<string, unknown> | null)?.[field] === key)
        .length === 1;
    if (typeof key === "string" && isUnique) return key;
  }
  return String(index);
}

function flattenValue(value: unknown, path: string, values: Record<string, string>): void {
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry !== "object" || entry === null)) {
      values[path] = value.join(", ");
      return;
    }
    value.forEach((entry, index) =>
      flattenValue(entry, `${path}.${readEntryKey(entry, index, value)}`, values),
    );
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      flattenValue(entry, path ? `${path}.${key}` : key, values);
    }
  } else {
    values[path] = String(value);
  }
}

async function readValues(): Promise<Values> {
  // Imported here because the stacks are read at import, and an unusable copy should end up
  // in the pull request body instead of a stack trace.
  const { DOTNS_ENVIRONMENTS } = await import("../src/utils/environments");
  return Object.fromEntries(
    Object.values(DOTNS_ENVIRONMENTS).map((environment) => {
      const values: Record<string, string> = {};
      flattenValue(environment.descriptor, "", values);
      return [environment.id, values];
    }),
  );
}

function describeChanges(before: Values, after: Values): string {
  const sections = Object.entries(after).map(([id, values]) => {
    const previous = before[id] ?? {};
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(values)])];
    const changedKeys = keys.filter((key) => previous[key] !== values[key]);
    if (changedKeys.length === 0) return `**${id}**: no value changed.`;
    const lines = changedKeys.map(
      (key) => `- \`${key}\`: \`${previous[key] ?? "(none)"}\` -> \`${values[key] ?? "(none)"}\``,
    );
    return [`**${id}**`, "", ...lines].join("\n");
  });
  return [
    "The CLI's bundled stack copies now match the published descriptors. Changed values, before -> after:",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

const [mode, beforeFile] = process.argv.slice(2);
if (mode === "--compare" && beforeFile) {
  const before = JSON.parse(await Bun.file(beforeFile).text()) as Values;
  try {
    console.log(describeChanges(before, await readValues()));
  } catch (error) {
    console.log(
      `The updated stack copies fail the build check:\n\n\`\`\`\n${formatErrorMessage(error)}\n\`\`\``,
    );
  }
} else if (mode === undefined) {
  console.log(JSON.stringify(await readValues(), null, 2));
} else {
  console.error("usage: stackValues.ts [--compare <before.json>]");
  process.exit(1);
}
