// Generates the body of a CLI release, so cutting a release needs no notes written
// by hand. The body states the dotNS protocol releases and networks the CLI
// supports; GitHub appends the merged pull requests below it, grouped by
// .github/release.yml. Both lists are read from the code and the bundled stacks,
// so they cannot drift from what the release supports.
//
//   releaseNotes.mjs body
//
// Runs under bun, which imports the TypeScript constants directly.

import { fileURLToPath } from "node:url";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function compatibilitySection() {
  const constants = await import("../packages/cli/src/utils/constants.ts");
  const { DOTNS_ENVIRONMENTS } = await import("../packages/cli/src/utils/environments.ts");
  const versions = constants.SUPPORTED_PROTOCOL_VERSIONS;
  const environments = Object.values(DOTNS_ENVIRONMENTS);
  return [
    "### Compatibility",
    "",
    `- **dotNS protocol releases**: ${versions.map((v) => `\`${v}\``).join(", ")}. The CLI refuses a network that does not declare one of them.`,
    `- **Networks**: ${environments.map((e) => `\`${e.id}\` (${e.label}, stack sequence ${e.descriptor.sequence})`).join(", ")}. Select one with \`--env\`, or run on another stack with \`--stack\`.`,
  ].join("\n");
}

async function main() {
  const [mode] = process.argv.slice(2);
  if (mode !== "body") fail("Usage: releaseNotes.mjs body");
  console.log(await compatibilitySection());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
